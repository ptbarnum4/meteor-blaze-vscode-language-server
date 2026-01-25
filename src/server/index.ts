import connectionConfig from './connection/index.js';

const { documents, connection } = connectionConfig;

// Leave at the end of the file
documents.listen(connection);
connection.listen();
