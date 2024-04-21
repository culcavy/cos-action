import { collectLocalFiles } from '../src/main'

test('test collectLocalFiles', async () => {
  const files = await collectLocalFiles('src')
  console.log(files)
})
