Electron App Icons
==================

Generated icons for your Electron application.

Directory Structure:
--------------------
/
├── icon.png          # Original source image (1024x1024 recommended)
├── icon.ico          # Windows icon file (contains multiple sizes)
├── icon.icns         # macOS icon file (contains multiple sizes)
├── icons/            # Linux PNG icons
│   ├── 16x16.png
│   ├── 32x32.png
│   ├── 48x48.png
│   ├── 64x64.png
│   ├── 128x128.png
│   ├── 256x256.png
│   └── 512x512.png
└── README.txt        # This file

Runtime Icons (resources/):
---------------------------
For runtime access (BrowserWindow icons), copies are stored in resources/:
├── icon.ico          # Windows runtime icon
├── icon.linux.png    # Linux runtime icon (512x512)
└── icon.png          # Source image

electron-builder Configuration:
-------------------------------
Icons are configured in electron-builder.yml:
- win.icon: build/icon.ico
- mac.icon: build/icon.icns
- linux.icon: build/icons

Usage in Electron (src/main/index.ts):
---------------------------------------
import iconWin from '../../resources/icon.ico?asset'
import iconLinux from '../../resources/icon.linux.png?asset'

const mainWindow = new BrowserWindow({
  ...(process.platform === 'win32' ? { icon: iconWin } : {}),
  ...(process.platform === 'linux' ? { icon: iconLinux } : {}),
  // ...
})

// macOS icon is set automatically via electron-builder (build/icon.icns)

Generated with WebUtils - https://webutils.io