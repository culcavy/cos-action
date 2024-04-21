import COS from 'cos-nodejs-sdk-v5'
import { TCOS, process } from './main'
import * as core from '@actions/core'

const run = async () => {
  const ms: string = core.getInput('milliseconds')
  core.debug(`Waiting ${ms} milliseconds ...`)
  core.debug(new Date().toTimeString())
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
  await process(cos)
  core.debug(new Date().toTimeString())
}

run().catch(error => {
  if (error instanceof Error) core.setFailed(error.message)
})
