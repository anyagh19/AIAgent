import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Microsoft Store Apps
const storeApps = {
  whatsapp: "5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App",
  instagram: "Facebook.InstagramBeta_8xx8rvfyw5nnt!App",
  spotify: "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify",
  calculator: "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App",
  notepad: "Microsoft.WindowsNotepad_8wekyb3d8bbwe!App",
  camera: "Microsoft.WindowsCamera_8wekyb3d8bbwe!App",
  terminal: "Microsoft.WindowsTerminal_8wekyb3d8bbwe!App",
  settings:
    "windows.immersivecontrolpanel_cw5n1h2txyewy!microsoft.windows.immersivecontrolpanel",
  store: "Microsoft.WindowsStore_8wekyb3d8bbwe!App",
  photos: "Microsoft.Windows.Photos_8wekyb3d8bbwe!App"
};

// Desktop Applications
const desktopApps = {
  chrome:
    '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"',
  edge:
    '"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"',
  vscode:
    `"C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe"`,
  discord:
    `"C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\Discord\\Update.exe" --processStart Discord.exe`,
  postman:
    `"C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\Postman\\Postman.exe"`,
  explorer: "explorer.exe",
  cmd: "cmd.exe",
  powershell: "powershell.exe",
  node: "node.exe",
  word: "winword.exe",
  excel: "excel.exe",
  powerpoint: "powerpnt.exe",
  vlc: '"C:\\Program Files\\VideoLAN\\VLC\\vlc.exe"'
};

export async function launchApp(appName) {
  try {
    const key = appName.toLowerCase().trim();

    let command;

    // Store Apps
    if (storeApps[key]) {
      command = `
        explorer.exe shell:AppsFolder\\${storeApps[key]}
      `;
    }

    // Desktop Apps
    else if (desktopApps[key]) {
      command = `
        Start-Process ${desktopApps[key]}
      `;
    }

    // Fallback
    else {
      command = `
        Start-Process "${appName}"
      `;
    }

    await execAsync(command, {
      shell: "powershell.exe"
    });

    return {
      content: [
        {
          type: "text",
          text: `✅ Launched ${appName}`
        }
      ]
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `❌ Failed to launch ${appName}: ${err.message}`
        }
      ],
      isError: true
    };
  }
}