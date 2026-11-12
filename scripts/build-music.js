const fs = require('node:fs')
const path = require('node:path')
const {execFileSync} = require('node:child_process')

const root = path.resolve(__dirname, '..')
const framework = path.join(process.env.SystemRoot, 'Microsoft.NET/Framework64/v4.0.30319')
const metadata = path.join(process.env.SystemRoot, 'System32/WinMetadata')
const source = path.join(root, 'native/MusicMeter.cs')
const target = path.join(root, 'native/build/MusicMeter.exe')
fs.mkdirSync(path.dirname(target), {recursive:true})
execFileSync(path.join(framework, 'csc.exe'), [
  '/nologo', '/optimize+', '/platform:x64', '/out:' + target,
  '/reference:' + path.join(framework, 'System.Runtime.dll'),
  '/reference:' + path.join(framework, 'System.Runtime.WindowsRuntime.dll'),
  ...['Foundation', 'Media'].map(name => '/reference:' + path.join(metadata, 'Windows.' + name + '.winmd')),
  source
], {stdio:'inherit'})
