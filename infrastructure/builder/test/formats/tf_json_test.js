const util = require('util');
const path = require('path');
const temporary = require('temporary');
const rimraf = util.promisify(require('rimraf'));
const {ClusterSpec} = require('../../src/formats/cluster-spec');

suite('TerraformJson', function() {
  let tempDir;

  const makeTempDir = content => {
    tempDir = new temporary.Dir();
    return tempDir.path;
  };

  teardown(async function() {
    if (tempDir) {
      await rimraf(tempDir.path);
      tempDir = null;
    }
  });

  test('load cluster spec from directory', function() {
    new ClusterSpec(path.join(__dirname, 'example'));
    path.join(makeTempDir(), 'out.tf.json');
  });
});
