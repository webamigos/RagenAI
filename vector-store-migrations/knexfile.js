const dotenvFlow = require('dotenv-flow');

dotenvFlow.config({
  path: __dirname + '/../',
});

const knexConfig = {
  client: 'postgresql',
  connection: {
    connectionString: process.env.DIRECT_URL,
  },
  migrations: {
    directory: __dirname + '/migrations',
    tableName: 'migrations',
  },
};

module.exports = knexConfig;
