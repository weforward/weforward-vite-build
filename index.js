const path = require('path')
const fs = require('fs')
const request = require('request')
const archiver = require('archiver')
const Base64 = require('js-base64')
const shell = require('shelljs')

let _d = new Date()
const BUILD_YEAR = _d.getFullYear()
const BUILD_TIME = _d.getFullYear() + '-' + (_d.getMonth() + 1) + '-' + _d.getDate() + ' ' + _d.getHours() +
    ':' + _d.getMinutes() + ':' + _d.getSeconds()

const LINE = '\r\n'
const _packagePath = 'package.json'
const packagePath = path.resolve(process.cwd(), _packagePath)

const WeforwardVueBuilder = function (config) {
    let _options = require(path.resolve(process.cwd(), _packagePath))
    let plugin = {
        options: _options,
        name: _options.name,
        version: _options.version,
        hosts: exchangeHostToHosts(config.env.VITE_VUE_APP_WF_HOST),
        isPackage: config.env.VITE_WF_BUILD_IS_PACKAGE,
        isGrowVersion: config.env.VITE_WF_BUILD_IS_GROW_VERSION,
        isDist: config.env.VITE_WF_BUILD_IS_DIST,
        disthubUrl: config.env.VITE_WF_BUILD_DISTHUB_URL,
        distAuthorization: config.env.VITE_WF_BUILD_DIST_AUTHORIZATION,
        isCommit: config.env.VITE_WF_BUILD_IS_COMMIT,
        isTag: config.env.VITE_WF_BUILD_IS_GROW_VERSION || config.env.VITE_WF_BUILD_IS_TAG
    }

    return {
        name: 'WeforwardVueBuilder',
        closeBundle() {
            complier(plugin)
        }
    }
}

function complier(plugin) {
    //删除svn文件
    emptyDir(path.resolve(process.cwd(), 'dist/.svn'))
    //删除git文件
    emptyDir(path.resolve(process.cwd(), 'dist/.git'))
    let versions = plugin.version.split('.')
    let mainVersion = versions[0]
    let numberVersion = versions[1]
    let serialVersion = versions[2]
    let _fullVersion
    let _gitVersion = mainVersion + '.' + numberVersion + '.' + serialVersion
    if (plugin.isPackage) {
        if (plugin.isGrowVersion) {
            serialVersion++
            _fullVersion = mainVersion + '.' + numberVersion + '.' + serialVersion
            _gitVersion = mainVersion + '.' + numberVersion + '.' + serialVersion
            changeVersion(plugin, _fullVersion)
        } else {
            _fullVersion = plugin.version
        }
        let indexPath = path.resolve(process.cwd(), 'dist/index.html')
        replaceContent(indexPath, plugin)

        let jsDir = path.resolve(process.cwd(), 'dist/static/js/')
        if (fs.existsSync(jsDir)) {
            fs.readdirSync(jsDir).forEach(function (file) {
                let pathname = path.join(jsDir, file)
                replaceContent(pathname, plugin)
            })
        }
        let cssDir = path.resolve(process.cwd(), 'dist/static/css/')
        if (fs.existsSync(cssDir)) {
            fs.readdirSync(cssDir).forEach(function (file) {
                let pathname = path.join(cssDir, file)
                replaceContent(pathname, plugin)
            })
        }
        let versionPath = path.resolve(process.cwd(), 'dist/js/wfversion.js')
        if (fs.existsSync(versionPath)) {
            let injectcontent = 'window._WEFORWARD_VERSION= ' +
                JSON.stringify({
                    version: _fullVersion,
                    buildTime: BUILD_TIME,
                    buildType: plugin.buildType,
                    name: plugin.name
                })
            appendContent(versionPath, injectcontent)
        }
        let configPath = path.resolve(process.cwd(), 'dist/js/wfconfig.js')
        if (plugin.hosts && JSON.stringify(plugin.hosts) !== '[""]' && fs.existsSync(configPath)) {
            let injectcontent = 'window._WEFORWARD_CONFIG=' + JSON.stringify({
                hosts: plugin.hosts
            })
            appendContent(configPath, injectcontent)
        }else{
            console.log('没有设置指定网关，删除wfconfig文件')
            fs.unlinkSync(configPath)
        }
    }
    if (plugin.isDist) {
        compressToZip(function () {

            if (!plugin.disthubUrl) {
                console.log('disthubUrl is empty，commit failed!')
                return
            }
            console.log('提交上传压缩打包文件')
            commitFile(plugin)
        })
    }
    //打包提交git仓库
    if (plugin.isCommit) {
        commitGit(plugin, _gitVersion)
    }
    //打包提交git标签
    if (plugin.isGrowVersion || plugin.isTag) {
        createGitTag(plugin, _gitVersion)
    }
}

function commitFile(plugin) {
    let versions = plugin.version.split('.')
    let mainVersion = versions[0]
    let numberVersion = versions[1]
    let serialVersion = versions[2]
    let tag = mainVersion + '.' + numberVersion + '.' + serialVersion
    let url = plugin.disthubUrl + plugin.name + '/' + tag + '/file.zip'
    let filePath = path.resolve(process.cwd(), '../dist.zip')
    let filestate = fs.statSync(filePath)
    console.log('committing,size:' + filestate.size + ',url:' + url)
    let headers = {}
    let authorization = plugin.distAuthorization
    if (authorization) {
        headers.Authorization = 'Basic ' + Base64.Base64.encode(authorization)
        console.log('Authorization:' + headers.Authorization)
    }
    request.post({
        url,
        headers: headers,
        formData: {
            file: fs.createReadStream(filePath)
        }
    }, function (error, response, body) {
        fs.unlinkSync(filePath)
        if (response) {
            if (response.statusCode === 200) {
                console.log('commit success!')
            } else if (response.statusCode === 401) {
                console.log('Authentication failed!'.red)
            } else {
                let info = (response.statusCode || 'commit failed!') + ''
                console.error(info.red)
            }
        } else {
            let info = (error || response.statusCode || 'commit failed!') + ''
            console.error(info.red)
        }
    })
}

/**
 * 压缩目录
 * @param {Object} callback
 */
function compressToZip(callback) {
    console.log('compressToZip begin')
    let src = path.resolve(process.cwd(), 'dist')
    let outpath = path.join(process.cwd(), '../dist.zip')
    var output = fs.createWriteStream(outpath)
    let archive = archiver('zip', {
        zlib: {
            level: 9
        }
    })
    archive.pipe(output)
    archive.directory(src, false)
    output.on('close', function () {
        console.log(archive.pointer() + ' total bytes')
        if (callback) {
            callback()
        }
    })
    archive.finalize()
}

/**
 * 追加内容
 * @param {Object} path 文件路径
 * @param {Object} content 文件内容
 */
function appendContent(path, content) {
    let file = fs.readFileSync(path)
    let source = file.toString()
    if (source) {
        source = source + LINE + content
    } else {
        source = content
    }
    fs.writeFileSync(path, source)
}

/**
 * 替换内容
 * @param {Object} path 文件路径
 * @param {Object} plugin 插件对象
 */
function replaceContent(path, plugin) {
    let versions = plugin.version.split('.')
    let mainVersion = versions[0]
    let numberVersion = versions[1]
    let serialVersion = versions[2]
    let tag = mainVersion + '.' + numberVersion + '.' + serialVersion
    if (fs.existsSync(path)) {
        let file = fs.readFileSync(path)
        let source = file.toString()
        source = source.replace(/#{name}/g, plugin.name)
        source = source.replace(/#{tag}/g, tag)
        fs.writeFileSync(path, source)
    }
}

//保存版本
function changeVersion(plugin, version) {
    plugin.version = version
    //版本保存
    let _packagePath = packagePath
    plugin.options.version = version
    fs.writeFileSync(_packagePath, JSON.stringify(plugin.options, null, '\t'))
    console.log('Build ' + version + ' success')

    let mfpath = path.resolve(process.cwd(), 'dist/MAINIFEST.MF')
    let context = ''
    context += 'Manifest-Version: 1.0'
    context += LINE
    context += 'Implementation-Version: ' + version
    context += LINE
    context += 'Created-By: Weforward Build'
    context += LINE
    context += 'Copyright: Weforward (c) ' + BUILD_YEAR
    context += LINE
    context += 'Built-Date: ' + BUILD_TIME
    context += LINE
    context += 'Extension-Name:' + plugin.name
    fs.writeFileSync(mfpath, context)
    console.log('Version ' + version)
}

//清空目录操作
function emptyDir(path) {
    let files = []
    if (fs.existsSync(path)) {
        files = fs.readdirSync(path)
        files.forEach(function (file, index) {
            let curPath = path + '/' + file
            if (fs.statSync(curPath).isDirectory()) {
                // recurse
                emptyDir(curPath)
            } else {
                // delete file
                fs.unlinkSync(curPath)
            }
        })
        fs.rmdirSync(path)
    }
}

// 形参:hostdesc: Object – 多域名处理
function exchangeHostToHosts(hostdesc) {
    return (hostdesc || '').split(',')
}

// 上传代码到git仓库
function commitGit(plugin, _gitVersion) {
    shell.exec('git add .', {}, () => {
        shell.exec(`git commit -m 打包提交${_gitVersion}版本代码`, {}, () => {
            shell.exec(`git push`, {}, data => {
                shell.echo(`代码提交成功`)
            })
        })
    })
}

// 创建当前代码标签
function createGitTag(plugin, _gitVersion) {
    shell.exec(`git tag -a ${_gitVersion} -m 创建版本号为${_gitVersion}标签`, {}, () => {
        shell.exec(`git push origin ${_gitVersion}`, {}, () => {
            shell.echo('标签创建提交成功')
        })
    })
}

module.exports = WeforwardVueBuilder
