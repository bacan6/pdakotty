/**
 * so-offline.js - IndexedDB wrapper for Stock Opname offline-first
 */
(function() {
    'use strict';

    var DB_NAME = 'soOfflineDB';
    var DB_VERSION = 1;
    var db = null;

    function initDB() {
        return new Promise(function(resolve, reject) {
            if (db) { resolve(db); return; }

            var req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = function(e) {
                var d = e.target.result;

                if (!d.objectStoreNames.contains('products')) {
                    var ps = d.createObjectStore('products', { keyPath: 'id_produk' });
                    ps.createIndex('nama_produk', 'nama_produk', { unique: false });
                }

                if (!d.objectStoreNames.contains('so_items')) {
                    var si = d.createObjectStore('so_items', { keyPath: 'id', autoIncrement: true });
                    si.createIndex('id_produk', 'id_produk', { unique: false });
                    si.createIndex('synced', 'synced', { unique: false });
                }

                if (!d.objectStoreNames.contains('sync_meta')) {
                    d.createObjectStore('sync_meta', { keyPath: 'key' });
                }
            };

            req.onsuccess = function(e) {
                db = e.target.result;
                resolve(db);
            };

            req.onerror = function(e) {
                reject(e.target.error);
            };
        });
    }

    function getSyncMeta(key) {
        return initDB().then(function(db) {
            return new Promise(function(resolve) {
                var tx = db.transaction(['sync_meta'], 'readonly');
                var req = tx.objectStore('sync_meta').get(key);
                req.onsuccess = function() { resolve(req.result ? req.result.value : null); };
                req.onerror = function() { resolve(null); };
            });
        });
    }

    function setSyncMeta(key, value) {
        return initDB().then(function(db) {
            return new Promise(function(resolve) {
                var tx = db.transaction(['sync_meta'], 'readwrite');
                tx.objectStore('sync_meta').put({ key: key, value: value });
                tx.oncomplete = function() { resolve(); };
            });
        });
    }

    function syncProducts(toko, token, onProgress) {
        var offset = 0;
        var limit = 500;
        var total = 0;
        var synced = 0;

        function fetchBatch() {
            return new Promise(function(resolve, reject) {
                var data = new FormData();
                data.append('toko', toko);
                data.append('token', token);
                data.append('offset', offset);
                data.append('limit', limit);

                $.ajax({
                    type: 'POST',
                    url: 'https://store.kottykosmetik.com/Q_Stock_opname/sync_products',
                    data: data,
                    processData: false,
                    contentType: false,
                    dataType: 'json',
                    success: function(res) {
                        if (res.status === 'error') {
                            reject(new Error(res.pesan));
                            return;
                        }
                        resolve(res);
                    },
                    error: function(xhr, status, err) {
                        reject(new Error(err || 'Network error'));
                    }
                });
            });
        }

        function storeProducts(products) {
            return initDB().then(function(db) {
                return new Promise(function(resolve, reject) {
                    var tx = db.transaction(['products'], 'readwrite');
                    var store = tx.objectStore('products');

                    products.forEach(function(p) {
                        p.synced_at = Date.now();
                        store.put(p);
                    });

                    tx.oncomplete = function() { resolve(); };
                    tx.onerror = function() { reject(tx.error); };
                });
            });
        }

        function loop() {
            return fetchBatch().then(function(res) {
                if (total === 0) total = res.total;

                return storeProducts(res.products).then(function() {
                    synced += res.count;
                    if (onProgress) onProgress(synced, total);

                    if (res.count < limit) {
                        return setSyncMeta('products_last_sync', Date.now()).then(function() {
                            return setSyncMeta('products_count', synced);
                        });
                    } else {
                        offset += limit;
                        return loop();
                    }
                });
            });
        }

        return initDB().then(loop);
    }

    function lookupProduct(id_produk) {
        return initDB().then(function(db) {
            return new Promise(function(resolve) {
                var tx = db.transaction(['products'], 'readonly');
                var req = tx.objectStore('products').get(id_produk);
                req.onsuccess = function() { resolve(req.result || null); };
                req.onerror = function() { resolve(null); };
            });
        });
    }

    function getProductCount() {
        return initDB().then(function(db) {
            return new Promise(function(resolve) {
                var tx = db.transaction(['products'], 'readonly');
                var req = tx.objectStore('products').count();
                req.onsuccess = function() { resolve(req.result); };
                req.onerror = function() { resolve(0); };
            });
        });
    }

    function saveSoItem(item) {
        return initDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(['so_items'], 'readwrite');
                var store = tx.objectStore('so_items');

                var record = {
                    id_produk: item.id_produk,
                    nama_produk: item.nama_produk,
                    stok_fisik: item.stok_fisik,
                    stok_before: item.stok_before,
                    harga: item.harga,
                    created_at: Date.now(),
                    synced: false
                };

                store.add(record);
                tx.oncomplete = function() { resolve(); };
                tx.onerror = function() { reject(tx.error); };
            });
        });
    }

    function getPendingItems() {
        return initDB().then(function(db) {
            return new Promise(function(resolve) {
                var tx = db.transaction(['so_items'], 'readonly');
                var store = tx.objectStore('so_items');
                var idx = store.index('synced');
                var req = idx.getAll(IDBKeyRange.only(false));

                req.onsuccess = function() { resolve(req.result || []); };
                req.onerror = function() { resolve([]); };
            });
        });
    }

    function getPendingCount() {
        return initDB().then(function(db) {
            return new Promise(function(resolve) {
                var tx = db.transaction(['so_items'], 'readonly');
                var idx = tx.objectStore('so_items').index('synced');
                var req = idx.count(IDBKeyRange.only(false));

                req.onsuccess = function() { resolve(req.result); };
                req.onerror = function() { resolve(0); };
            });
        });
    }

    function bulkSyncToServer(toko, token, iduser) {
        return getPendingItems().then(function(items) {
            if (items.length === 0) {
                return { status: 'success', pesan: 'Tidak ada data pending', saved_count: 0 };
            }

            var aggregated = {};
            items.forEach(function(item) {
                if (aggregated[item.id_produk]) {
                    aggregated[item.id_produk].stok_fisik += parseInt(item.stok_fisik);
                } else {
                    aggregated[item.id_produk] = {
                        id_produk: item.id_produk,
                        stok_fisik: parseInt(item.stok_fisik)
                    };
                }
            });

            var payload = Object.values(aggregated);

            return new Promise(function(resolve, reject) {
                var data = new FormData();
                data.append('toko', toko);
                data.append('token', token);
                data.append('iduser', iduser);
                data.append('items', JSON.stringify(payload));

                $.ajax({
                    type: 'POST',
                    url: 'https://store.kottykosmetik.com/Q_Stock_opname/bulk_save_so',
                    data: data,
                    processData: false,
                    contentType: false,
                    dataType: 'json',
                    success: function(res) {
                        if (res.status === 'success') {
                            clearPendingItems().then(function() {
                                resolve(res);
                            });
                        } else {
                            reject(new Error(res.pesan));
                        }
                    },
                    error: function(xhr, status, err) {
                        reject(new Error(err || 'Network error'));
                    }
                });
            });
        });
    }

    function clearPendingItems() {
        return initDB().then(function(db) {
            return new Promise(function(resolve) {
                var tx = db.transaction(['so_items'], 'readwrite');
                tx.objectStore('so_items').clear();
                tx.oncomplete = function() { resolve(); };
            });
        });
    }

    function deleteSoItem(id) {
        return initDB().then(function(db) {
            return new Promise(function(resolve) {
                var tx = db.transaction(['so_items'], 'readwrite');
                tx.objectStore('so_items').delete(id);
                tx.oncomplete = function() { resolve(); };
            });
        });
    }

    window.SoOffline = {
        initDB: initDB,
        getSyncMeta: getSyncMeta,
        setSyncMeta: setSyncMeta,
        syncProducts: syncProducts,
        lookupProduct: lookupProduct,
        getProductCount: getProductCount,
        saveSoItem: saveSoItem,
        getPendingItems: getPendingItems,
        getPendingCount: getPendingCount,
        bulkSyncToServer: bulkSyncToServer,
        clearPendingItems: clearPendingItems,
        deleteSoItem: deleteSoItem
    };
})();
