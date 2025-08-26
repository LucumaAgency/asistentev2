// Sistema de logging centralizado para el frontend
// Controla los logs según el entorno

const isDevelopment = process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost';
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

// Configurar el nivel de log según el entorno
const currentLogLevel = isDevelopment ? LOG_LEVELS.DEBUG : LOG_LEVELS.ERROR;

class Logger {
  constructor(module = 'App') {
    this.module = module;
  }

  debug(...args) {
    if (currentLogLevel <= LOG_LEVELS.DEBUG) {
      console.log(`[${this.module}]`, ...args);
    }
  }

  info(...args) {
    if (currentLogLevel <= LOG_LEVELS.INFO) {
      console.info(`[${this.module}]`, ...args);
    }
  }

  warn(...args) {
    if (currentLogLevel <= LOG_LEVELS.WARN) {
      console.warn(`[${this.module}]`, ...args);
    }
  }

  error(...args) {
    if (currentLogLevel <= LOG_LEVELS.ERROR) {
      console.error(`[${this.module}]`, ...args);
    }
  }

  // Método especial para logs críticos que siempre se muestran
  critical(...args) {
    console.error(`[${this.module}] CRITICAL:`, ...args);
  }
}

// Exportar una instancia por defecto y la clase
export default new Logger();
export { Logger };

// Función helper para crear un logger específico por módulo
export function createLogger(moduleName) {
  return new Logger(moduleName);
}