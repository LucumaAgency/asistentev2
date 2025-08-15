// ENDPOINT TEMPORAL DE DEBUGGING
// Agregar esto temporalmente a server.cjs después de las rutas de auth

const debugInfo = {
    lastLoginAttempt: null,
    lastTokenSaveAttempt: null,
    dbStatus: null,
    errors: []
};

// Endpoint para ver información de debug
app.get('/api/debug/oauth-status', (req, res) => {
    res.json({
        message: 'Debug info for OAuth token saving',
        lastLoginAttempt: debugInfo.lastLoginAttempt,
        lastTokenSaveAttempt: debugInfo.lastTokenSaveAttempt,
        dbConnected: !!db,
        dbStatus: debugInfo.dbStatus,
        errors: debugInfo.errors,
        timestamp: new Date().toISOString()
    });
});

// Para usar en auth.cjs, exportar debugInfo:
module.exports = { debugInfo };