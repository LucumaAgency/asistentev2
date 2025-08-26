// Sistema de logging centralizado para el backend
// Controla los logs según el entorno

const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4
};

// Configurar el nivel de log según el entorno
const currentLogLevel = isDevelopment ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;

// Colores para los logs en consola
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  green: '\x1b[32m'
};

class BackendLogger {
  constructor(module = 'Server') {
    this.module = module;
  }

  formatMessage(level, ...args) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${this.module}] ${level}:`;
  }

  debug(...args) {
    if (currentLogLevel <= LOG_LEVELS.DEBUG) {
      console.log(colors.gray + this.formatMessage('DEBUG') + colors.reset, ...args);
    }
  }

  info(...args) {
    if (currentLogLevel <= LOG_LEVELS.INFO) {
      console.log(colors.blue + this.formatMessage('INFO') + colors.reset, ...args);
    }
  }

  warn(...args) {
    if (currentLogLevel <= LOG_LEVELS.WARN) {
      console.warn(colors.yellow + this.formatMessage('WARN') + colors.reset, ...args);
    }
  }

  error(...args) {
    if (currentLogLevel <= LOG_LEVELS.ERROR) {
      console.error(colors.red + this.formatMessage('ERROR') + colors.reset, ...args);
    }
  }

  success(...args) {
    if (currentLogLevel <= LOG_LEVELS.INFO) {
      console.log(colors.green + this.formatMessage('SUCCESS') + colors.reset, ...args);
    }
  }

  // Método especial para logs críticos que siempre se muestran
  critical(...args) {
    console.error(colors.red + this.formatMessage('CRITICAL') + colors.reset, ...args);
  }
}

// Función helper para crear un logger específico por módulo
function createLogger(moduleName) {
  return new BackendLogger(moduleName);
}

module.exports = {
  BackendLogger,
  createLogger,
  default: new BackendLogger()
};