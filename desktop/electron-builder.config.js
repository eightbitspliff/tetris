// electron-builder configuration for the Windows installer.
//
// Antivirus / SmartScreen friendliness:
//  - per-user install without admin rights: no elevate.exe helper and no UAC prompt,
//    which heuristic scanners (e.g. Bitdefender) often flag in unsigned installers
//  - full version metadata (company, description, copyright) in the executables
//  - optional code signing, enabled automatically when credentials are provided:
//      * Azure Trusted Signing: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET,
//        AZURE_SIGN_ENDPOINT, AZURE_SIGN_ACCOUNT, AZURE_SIGN_PROFILE, AZURE_SIGN_PUBLISHER
//      * or a .pfx certificate: CSC_LINK (base64 or path) + CSC_KEY_PASSWORD
const env = process.env;
const azureSigning = env.AZURE_SIGN_ENDPOINT && env.AZURE_SIGN_ACCOUNT && env.AZURE_SIGN_PROFILE
  && env.AZURE_TENANT_ID && env.AZURE_CLIENT_ID && env.AZURE_CLIENT_SECRET;

module.exports = {
  appId: 'com.eightbitspliff.neontetris',
  productName: 'Neon Tetris',
  copyright: 'Copyright © 2026 eightbitspliff',
  files: ['main.js', 'preload.js', 'build/icon.png', 'game/**/*'],
  directories: { output: 'release', buildResources: 'build' },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build/icon.png',
    legalTrademarks: 'Neon Tetris',
    requestedExecutionLevel: 'asInvoker',
    ...(azureSigning ? {
      azureSignOptions: {
        endpoint: env.AZURE_SIGN_ENDPOINT,
        codeSigningAccountName: env.AZURE_SIGN_ACCOUNT,
        certificateProfileName: env.AZURE_SIGN_PROFILE,
        publisherName: env.AZURE_SIGN_PUBLISHER || 'eightbitspliff',
      },
    } : {}),
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: false,
    packElevateHelper: false,
    allowToChangeInstallationDirectory: false,
    createDesktopShortcut: 'always',
    createStartMenuShortcut: true,
    shortcutName: 'Neon Tetris',
    uninstallDisplayName: 'Neon Tetris',
    installerLanguages: ['de_DE'],
    language: '1031',
    runAfterFinish: true,
    differentialPackage: false,
    artifactName: 'NeonTetris-Setup-${version}.${ext}',
  },
};
