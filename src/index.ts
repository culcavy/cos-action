import COS from "cos-nodejs-sdk-v5"
import { TCOS, process } from "./main"
import core from '@actions/core'

try {
  const cos: TCOS = {
    cli: new COS({
      SecretId: core.getInput('secret_id'),
      SecretKey: core.getInput('secret_key'),
      Domain:
        core.getInput('accelerate') === 'true'
          ? '{Bucket}.cos.accelerate.myqcloud.com'
          : undefined
    }),
    bucket: core.getInput('cos_bucket'),
    region: core.getInput('cos_region'),
    localPath: core.getInput('local_path'),
    remotePath: core.getInput('remote_path'),
    clean: core.getInput('clean') === 'true'
  }
  process(cos).catch(reason => {
    core.setFailed(`fail to upload files to cos: ${reason.message}`)
  })
} catch (err) {
  core.setFailed(`fail to upload files to cos: ${err}`)
}
