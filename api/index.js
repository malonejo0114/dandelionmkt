const getAppBundle = require('../src/server');

module.exports = async (req, res) => {
  const { app } = await getAppBundle();
  return app(req, res);
};
