function throwIfError(error, message) {
  if (!error) return;
  throw new Error(`${message}: ${error.message}`);
}

module.exports = {
  throwIfError,
};
