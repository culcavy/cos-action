import core from '@actions/core'
import COS, { CosSdkError, GetBucketResult } from 'cos-nodejs-sdk-v5'
import { promises, createReadStream } from 'fs'
import Path from 'path'

const cos = {
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

type TCOS = typeof cos

const walk = async (path: string, walkFn: (path: string) => Promise<void>) => {
  const stats = await promises.lstat(path)
  if (!stats.isDirectory()) {
    return await walkFn(path)
  }

  const dir = await promises.opendir(path)
  for await (const dirent of dir) {
    await walk(Path.join(path, dirent.name), walkFn)
  }
}

const uploadFileToCOS = (cos: TCOS, path: string) => {
  return new Promise((resolve, reject) => {
    cos.cli.putObject(
      {
        Bucket: cos.bucket,
        Region: cos.region,
        Key: Path.join(cos.remotePath, path),
        StorageClass: 'STANDARD',
        Body: createReadStream(Path.join(cos.localPath, path))
      },
      (err, data) => {
        if (err) {
          return reject(err)
        } else {
          return resolve(data)
        }
      }
    )
  })
}

const deleteFileFromCOS = (cos: TCOS, path: string) => {
  return new Promise((resolve, reject) => {
    cos.cli.deleteObject(
      {
        Bucket: cos.bucket,
        Region: cos.region,
        Key: Path.join(cos.remotePath, path)
      },
      (err, data) => {
        if (err) {
          return reject(err)
        } else {
          return resolve(data)
        }
      }
    )
  })
}

const listFilesOnCOS = (cos: TCOS, nextMarker?: string) => {
  return new Promise<GetBucketResult>((resolve, reject) => {
    cos.cli.getBucket(
      {
        Bucket: cos.bucket,
        Region: cos.region,
        Prefix: cos.remotePath,
        Marker: nextMarker
      },
      (err, data) => {
        if (err) {
          return reject(err)
        } else {
          return resolve(data)
        }
      }
    )
  })
}

const collectLocalFiles = async (cos: TCOS) => {
  const root = cos.localPath
  const files = new Set<string>()
  await walk(root, async (path: string) => {
    let p = path.substring(root.length)
    for (; p[0] === '/'; ) {
      p = p.substring(1)
    }
    files.add(p)
  })
  return files
}

const uploadFiles = async (cos: TCOS, localFiles: Set<string>) => {
  const size = localFiles.size
  let index = 0
  let percent = 0
  for (const file of localFiles) {
    await uploadFileToCOS(cos, file)
    index++
    percent = (index / size) * 100
    console.log(
      `>> [${index}/${size}, ${percent}%] uploaded ${Path.join(cos.localPath, file)}`
    )
  }
}

const collectRemoteFiles = async (cos: TCOS) => {
  const files = new Set<string>()
  let data: GetBucketResult | null = null
  let nextMarker = undefined

  do {
    data = await listFilesOnCOS(cos, nextMarker)
    for (const e of data.Contents) {
      let p = e.Key.substring(cos.remotePath.length)
      for (; p[0] === '/'; ) {
        p = p.substring(1)
      }
      files.add(p)
    }
    nextMarker = data.NextMarker
  } while (data.IsTruncated === 'true')

  return files
}

const findDeletedFiles = (
  localFiles: Set<string>,
  remoteFiles: Set<string>
) => {
  const deletedFiles = new Set<string>()
  for (const file of remoteFiles) {
    if (!localFiles.has(file)) {
      deletedFiles.add(file)
    }
  }
  return deletedFiles
}

const cleanDeleteFiles = async (cos: TCOS, deleteFiles: Set<string>) => {
  const size = deleteFiles.size
  let index = 0
  let percent = 0
  for (const file of deleteFiles) {
    await deleteFileFromCOS(cos, file)
    index++
    percent = (index / size) * 100
    console.log(
      `>> [${index}/${size}, ${percent}%] cleaned ${Path.join(cos.remotePath, file)}`
    )
  }
}

const process = async (cos: TCOS) => {
  const localFiles = await collectLocalFiles(cos)
  console.log(localFiles.size, 'files to be uploaded')
  await uploadFiles(cos, localFiles)
  let cleanedFilesCount = 0
  if (cos.clean) {
    const remoteFiles = await collectRemoteFiles(cos)
    const deletedFiles = findDeletedFiles(localFiles, remoteFiles)
    if (deletedFiles.size > 0) {
      console.log(`${deletedFiles.size} files to be cleaned`)
    }
    await cleanDeleteFiles(cos, deletedFiles)
    cleanedFilesCount = deletedFiles.size
  }
  let cleanedFilesMessage = ''
  if (cleanedFilesCount > 0) {
    cleanedFilesMessage = `, cleaned ${cleanedFilesCount} files`
  }
  console.log(`uploaded ${localFiles.size} files${cleanedFilesMessage}`)
}

try {
  process(cos).catch(reason => {
    core.setFailed(`fail to upload files to cos: ${reason.message}`)
  })
} catch (err) {
  core.setFailed(`fail to upload files to cos: ${err}`)
}
