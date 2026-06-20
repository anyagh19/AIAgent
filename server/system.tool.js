// system.tool.js
import os from 'os';

export async function getSystemInfo() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const uptime = os.uptime();
  
  const info = `
🖥️ **System Information**
- Hostname: ${os.hostname()}
- Platform: ${os.platform()} (${os.arch()})
- OS Release: ${os.release()}
- Uptime: ${formatUptime(uptime)}
- CPUs: ${cpus.length} cores, model: ${cpus[0]?.model || 'unknown'}
- Memory: ${formatBytes(totalMem)} total, ${formatBytes(freeMem)} free
- Load Average: ${os.loadavg().map(l => l.toFixed(2)).join(', ')}
- Node Version: ${process.version}
`;
  return { content: [{ type: "text", text: info }] };
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${days}d ${hours}h ${mins}m ${secs}s`;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}