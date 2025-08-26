const fs = require('fs');
const path = require('path');

class FileLogger {
  constructor(logFile = 'app.log') {
    this.logFile = path.join(process.cwd(), logFile);
    this.errorLogFile = path.join(process.cwd(), 'error.log');
    this.crashLogFile = path.join(process.cwd(), 'crash.log');
    
    // Crear archivos si no existen
    this.ensureLogFile(this.logFile);
    this.ensureLogFile(this.errorLogFile);
    this.ensureLogFile(this.crashLogFile);
    
    // Limpiar logs antiguos si son muy grandes (>10MB)
    this.cleanOldLogs();
  }
  
  ensureLogFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, `=== Log iniciado: ${new Date().toISOString()} ===\n`);
      }
    } catch (error) {
      console.error('Error creando archivo de log:', error.message);
    }
  }
  
  cleanOldLogs() {
    try {
      [this.logFile, this.errorLogFile, this.crashLogFile].forEach(file => {
        if (fs.existsSync(file)) {
          const stats = fs.statSync(file);
          // Si el archivo es mayor a 10MB, lo renombra y crea uno nuevo
          if (stats.size > 10 * 1024 * 1024) {
            const backupFile = file.replace('.log', `-${Date.now()}.log`);
            fs.renameSync(file, backupFile);
            this.ensureLogFile(file);
          }
        }
      });
    } catch (error) {
      console.error('Error limpiando logs:', error.message);
    }
  }
  
  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const pid = process.pid;
    let logLine = `[${timestamp}] [PID:${pid}] [${level}] ${message}`;
    
    if (data) {
      try {
        logLine += '\n' + JSON.stringify(data, null, 2);
      } catch (e) {
        logLine += '\n[Error serializando datos]';
      }
    }
    
    return logLine + '\n';
  }
  
  writeToFile(file, content) {
    try {
      fs.appendFileSync(file, content, 'utf8');
    } catch (error) {
      // Si no puede escribir al archivo, al menos intenta console
      console.error('No se pudo escribir al archivo de log:', error.message);
      console.log(content);
    }
  }
  
  log(message, data = null) {
    const content = this.formatMessage('INFO', message, data);
    this.writeToFile(this.logFile, content);
  }
  
  error(message, error = null) {
    const errorData = error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : null;
    
    const content = this.formatMessage('ERROR', message, errorData);
    this.writeToFile(this.errorLogFile, content);
    this.writeToFile(this.logFile, content);
  }
  
  crash(message, error = null) {
    const crashData = {
      message: error?.message || message,
      stack: error?.stack || new Error().stack,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      memory: process.memoryUsage(),
      uptime: process.uptime()
    };
    
    const content = this.formatMessage('CRASH', message, crashData);
    this.writeToFile(this.crashLogFile, content);
    this.writeToFile(this.errorLogFile, content);
    this.writeToFile(this.logFile, content);
  }
  
  debug(message, data = null) {
    if (process.env.NODE_ENV === 'development') {
      const content = this.formatMessage('DEBUG', message, data);
      this.writeToFile(this.logFile, content);
    }
  }
  
  // Método para leer los últimos N líneas del log
  readLastLines(lines = 100, logType = 'app') {
    try {
      let targetFile;
      switch(logType) {
        case 'error':
          targetFile = this.errorLogFile;
          break;
        case 'crash':
          targetFile = this.crashLogFile;
          break;
        default:
          targetFile = this.logFile;
      }
      
      if (!fs.existsSync(targetFile)) {
        return 'Log file not found';
      }
      
      const content = fs.readFileSync(targetFile, 'utf8');
      const allLines = content.split('\n');
      const lastLines = allLines.slice(-lines);
      
      return lastLines.join('\n');
    } catch (error) {
      return `Error reading log: ${error.message}`;
    }
  }
  
  // Limpiar todos los logs
  clearLogs() {
    try {
      [this.logFile, this.errorLogFile, this.crashLogFile].forEach(file => {
        if (fs.existsSync(file)) {
          fs.writeFileSync(file, `=== Log limpiado: ${new Date().toISOString()} ===\n`);
        }
      });
      return true;
    } catch (error) {
      console.error('Error limpiando logs:', error.message);
      return false;
    }
  }
}

// Singleton para usar en toda la aplicación
let instance = null;

function getLogger() {
  if (!instance) {
    instance = new FileLogger();
  }
  return instance;
}

module.exports = { FileLogger, getLogger };