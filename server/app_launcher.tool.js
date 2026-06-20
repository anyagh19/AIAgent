import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// ✅ Store Apps (from your Get-StartApps output)
const storeApps = {
  whatsapp: "5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App",
  instagram: "Facebook.InstagramBeta_8xx8rvfyw5nnt!App",
  spotify: "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify",
  calculator: "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App",
  notepad: "Microsoft.WindowsNotepad_8wekyb3d8bbwe!App",
  camera: "Microsoft.WindowsCamera_8wekyb3d8bbwe!App",
  terminal: "Microsoft.WindowsTerminal_8wekyb3d8bbwe!App",
  settings: "windows.immersivecontrolpanel_cw5n1h2txyewy!microsoft.windows.immersivecontrolpanel",
  store: "Microsoft.WindowsStore_8wekyb3d8bbwe!App",
  photos: "Microsoft.Windows.Photos_8wekyb3d8bbwe!App"
};

// ✅ Desktop apps / commands
const desktopApps = {
  chrome: "chrome",
  edge: "msedge",
  vscode: "code",
  discord: "discord",
  postman: "postman",
  node: "node",
  explorer: "explorer",
  cmd: "cmd",
  powershell: "powershell",
  word: "winword",
  excel: "excel",
  powerpoint: "powerpnt",
  vlc: `"C:\\Program Files\\VideoLAN\\VLC\\vlc.exe"`
};

export async function launchApp(appName) {
  try {
    const key = appName.toLowerCase().trim();

    let command = "";

    // ✅ Priority 1: Store Apps
    if (storeApps[key]) {
      command = `start "" shell:AppsFolder\\${storeApps[key]}`;
    }
    // ✅ Priority 2: Desktop Apps
    else if (desktopApps[key]) {
      command = `start "" ${desktopApps[key]}`;
    }
    // ❗ Fallback (try direct)
    else {
      command = `start "" ${appName}`;
    }

    await execAsync(command, { shell: "powershell.exe" });

    return {
      content: [{ type: "text", text: `✅ Launched ${appName}` }]
    };

  } catch (err) {
    return {
      content: [{ type: "text", text: `❌ Failed to launch ${appName}: ${err.message}` }],
      isError: true
    };
  }
}