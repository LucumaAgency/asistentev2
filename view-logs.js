const fs = require('fs');
const path = require('path');

// Buscar archivos de log comunes
const logPaths = [
    './logs/app.log',
    './logs/error.log',
    './app.log',
    './error.log',
    '/var/log/nodejs/app.log',
    './debug.log'
];

console.log('🔍 Buscando archivos de logs...\n');

logPaths.forEach(logPath => {
    try {
        if (fs.existsSync(logPath)) {
            console.log(`✅ Encontrado: ${logPath}`);
            const content = fs.readFileSync(logPath, 'utf8');
            const lines = content.split('\n');
            const last50Lines = lines.slice(-50).join('\n');
            console.log(`\n📄 Últimas 50 líneas de ${logPath}:\n`);
            console.log(last50Lines);
            console.log('\n' + '='.repeat(80) + '\n');
        }
    } catch (error) {
        // Archivo no encontrado o sin permisos
    }
});

// Buscar en el directorio actual
try {
    const files = fs.readdirSync('./');
    const logFiles = files.filter(f => f.includes('.log'));
    if (logFiles.length > 0) {
        console.log('📁 Archivos .log en el directorio actual:', logFiles);
    }
} catch (error) {
    console.log('❌ Error leyendo directorio:', error.message);
}

console.log('\n💡 Si no ves logs, probablemente están en el panel de Plesk');
console.log('   Ve a: Plesk > Tu App > Node.js > Logs');