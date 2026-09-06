cordova.define('cordova/plugin_list', function(require, exports, module) {
  module.exports = [
    {
      "id": "cordova-plugin-qr-barcode-scanner.BarcodeScanner",
      "file": "plugins/cordova-plugin-qr-barcode-scanner/www/barcodescanner.js",
      "pluginId": "cordova-plugin-qr-barcode-scanner",
      "clobbers": [
        "cordova.plugins.barcodeScanner"
      ]
    }
  ];
  module.exports.metadata = {
    "cordova-plugin-qr-barcode-scanner": "8.0.3"
  };
});