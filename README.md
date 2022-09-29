# weforward项目构建依赖插件


需要配合weforward项目的配置文件使用
```js
//vite.config.js
import {loadEnv} from "vite"
import builder from "weforward-builder"
export default({command,mode} => {
    return{
        plugins: [
            builder({
				env: loadEnv(mode, process.cwd())
            }),
        ]
    }
})

```

环境变量
```
#NODE 环境
VITE_APP_ENV=production

# APP公开入口
VITE_VUE_APP_WF_PUBLICPATH=/#{name}/#{tag}/

#接口域名，多个时使用英文逗号隔开
VITE_VUE_APP_WF_HOST=//wf.weforward.xyz

#是否增长版本
VITE_WF_BUILD_IS_GROW_VERSION=true

#是否打包
VITE_WF_BUILD_IS_PACKAGE=true

#是否发布
VITE_WF_BUILD_IS_DIST=true

#项目编译后提交的路径
VITE_WF_BUILD_DISTHUB_URL=http://xxxx/dist/html/

#编译并提交项目需要鉴权，内容格式为"用户名:密码"
VITE_WF_BUILD_DIST_AUTHORIZATION=xxx:xxx

#编译并提交项目到git仓库中,此处为字符串，不需要提交请不要设置
VITE_WF_BUILD_IS_COMMIT=true

```