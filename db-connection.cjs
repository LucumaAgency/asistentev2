// Módulo compartido para la conexión de base de datos
// Este módulo permite acceder a la BD desde cualquier lugar

let dbConnection = null;
let isConnected = false;

module.exports = {
  setConnection: (connection) => {
    dbConnection = connection;
    isConnected = !!connection;
    console.log('🔗 DB Connection establecida en módulo compartido:', isConnected);
  },
  
  getConnection: () => {
    if (!dbConnection) {
      console.log('⚠️ DB Connection solicitada pero no está disponible');
    }
    return dbConnection;
  },
  
  isConnected: () => isConnected,
  
  // Función helper para debug
  testConnection: async () => {
    if (!dbConnection) {
      return { connected: false, error: 'No hay conexión' };
    }
    
    try {
      const [result] = await dbConnection.execute('SELECT 1 as test');
      return { connected: true, result: result[0] };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }
};