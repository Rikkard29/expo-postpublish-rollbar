const path = require('path');
const request = require('request');
const rimraf = require('rimraf');
const mkdirp = require('mkdirp');
const fs = require('fs');

const ENDPOINT = 'https://api.rollbar.com/api/1/sourcemap';

function uploadSourceMap(token, version, minifiedUrl, { sourceMap, sourceFile }) {
  
  return new Promise((resolver, rejector) => {
    const req = request.post(ENDPOINT, (err, res, body) => {
      if (!err && res.statusCode === 200) {
        resolver()
        return;
      }
  
      const errMessage = `failed to upload ${sourceMap} to Rollbar`;
      if (err) {
        rejector(new Error(err, errMessage));
        return;
      }
  
      try {
        const { message } = JSON.parse(body);
        rejector(new Error(message ? `${errMessage}: ${message}` : errMessage));
        return
      } catch (parseErr) {
        rejector(new Error(parseErr, errMessage));
        return
      }
    });
  
    const form = req.form();
    form.append('access_token', token);
    form.append('version', version);
    form.append('minified_url', minifiedUrl);
    form.append('source_map', fs.createReadStream(sourceMap));
  })
}

module.exports = async options => {
  let {
    config,
    log,
    iosBundle,
    iosSourceMap,
    iosManifest,
    androidBundle,
    androidSourceMap,
    androidManifest,
    projectRoot,
    exp,
  } = options;

  const tmpdir = path.resolve(projectRoot, '.tmp', 'rollbar');

  mkdirp.sync(tmpdir);

  try {
    fs.writeFileSync(tmpdir + '/main.ios.bundle', iosBundle, 'utf-8');
    fs.writeFileSync(tmpdir + '/main.android.bundle', androidBundle, 'utf-8');
    fs.writeFileSync(tmpdir + '/main.ios.map', iosSourceMap, 'utf-8');
    fs.writeFileSync(tmpdir + '/main.android.map', androidSourceMap, 'utf-8');

    // ios
    const iosIdentifyer = ['ios', iosManifest.ios.bundleIdentifier, iosManifest.ios.buildNumber].join('-')
    const iosFiles = {
      sourceFile: tmpdir + '/main.ios.bundle',
      sourceMap: tmpdir + '/main.ios.map'
    }
    const iosUpload = uploadSourceMap(config.serverItemAccessToken, iosIdentifyer, iosManifest.bundleUrl, iosFiles)
    .then(function() { log('Successfully uploaded iOS sourcemap to rollbar (' + iosIdentifyer + ').')})
    .catch(function(e) { log('Failed to upload iOS sourcemap to rollbar (' + e.message + ')') })

    await iosUpload;

    // android
    const androidIdentifyer = ['android', androidManifest.android.package, androidManifest.android.versionCode].join('-')
    const androidFiles = {
      sourceFile: tmpdir + '/main.android.bundle',
      sourceMap: tmpdir + '/main.android.map'
    } 
    const androidUpload = uploadSourceMap(
      config.serverItemAccessToken,
      androidIdentifyer,
      androidManifest.bundleUrl,
      androidFiles
    )
    .then(function () { log('Successfully uploaded Android sourcemap to rollbar (' + androidIdentifyer + ').') })
    .catch(function (e) { log('Successfully uploaded Android sourcemap to rollbar (' + e.message + ').') })

    await androidUpload

  } catch (e) {
    log(e);
    log(`Verify that your hook configuration in app.json is correct!`);
  } finally {
    rimraf.sync(tmpdir)
  }
}
