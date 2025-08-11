const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    // Crear carpeta logs si no existe
    this.logDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    // Archivo de log del día actual
    const today = new Date().toISOString().split('T')[0];
    this.logFile = path.join(this.logDir, `calendar-debug-${today}.log`);
  }

  writeLog(message, data = null) {
    const timestamp = new Date().toISOString();
    let logEntry = `[${timestamp}] ${message}\n`;
    
    if (data) {
      logEntry += `DATA: ${JSON.stringify(data, null, 2)}\n`;
    }
    
    logEntry += '---\n';
    
    // Escribir en archivo
    fs.appendFileSync(this.logFile, logEntry, 'utf8');
    
    // También mostrar en consola
    console.log(message);
    if (data) {
      console.log('DATA:', data);
    }
  }

  logCalendarEvent(event, data) {
    const timestamp = new Date().toISOString();
    const logEntry = `
=====================================
[${timestamp}] CALENDAR EVENT: ${event}
=====================================
${JSON.stringify(data, null, 2)}
=====================================

`;
    
    fs.appendFileSync(this.logFile, logEntry, 'utf8');
    console.log(`📝 [CALENDAR LOG] ${event}`);
  }

  logError(error) {
    const timestamp = new Date().toISOString();
    const logEntry = `
❌❌❌ ERROR ❌❌❌
[${timestamp}]
Message: ${error.message}
Stack: ${error.stack}
Full Error: ${JSON.stringify(error, null, 2)}
❌❌❌❌❌❌❌❌❌

`;
    
    fs.appendFileSync(this.logFile, logEntry, 'utf8');
    console.error('❌ Error logged to file');
  }

  getLogPath() {
    return this.logFile;
  }

  // Limpiar logs antiguos (más de 7 días)
  cleanOldLogs() {
    const files = fs.readdirSync(this.logDir);
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    
    files.forEach(file => {
      const filePath = path.join(this.logDir, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtime.getTime() > sevenDays) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Log antiguo eliminado: ${file}`);
      }
    });
  }
}

// Crear instancia única
const logger = new Logger();

module.exports = logger;