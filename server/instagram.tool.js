// import { exec } from 'child_process';
// import os from 'os';
// import { promisify } from 'util';

// const execAsync = promisify(exec);

// async function openInstagram() {
//   try {
//     const platform = os.platform();

//     if (platform === 'win32') {
//       try {
//         // ✅ Correct way for Microsoft Store app
//         await execAsync('start instagram:');
//       } catch {
//         await execAsync('start https://www.instagram.com');
//       }

//     } else if (platform === 'darwin') {
//       try {
//         await execAsync('open -a Instagram');
//       } catch {
//         await execAsync('open https://www.instagram.com');
//       }

//     } else {
//       try {
//         await execAsync('xdg-open https://www.instagram.com');
//       } catch {
//         await execAsync('xdg-open https://www.instagram.com');
//       }
//     }

//     await wait(3000);

//     return {
//       success: true,
//       content: [
//         {
//           type: "text",
//           text: "✅ WhatsApp opened successfully"
//         }
//       ]
//     };

//   } catch (error) {
//     return {
//       success: false,
//       content: [
//         {
//           type: "text",
//           text: `❌ Failed to open WhatsApp: ${error.message}`
//         }
//       ]
//     };
//   }
// }

// export default openInstagram;