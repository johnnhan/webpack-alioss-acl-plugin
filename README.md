# [webpack-alioss-acl-plugin](https://github.com/johnnhan/webpack-alioss-acl-plugin)

![](https://img.shields.io/github/package-json/v/johnnhan/webpack-alioss-acl-plugin)
![](https://img.shields.io/github/license/johnnhan/webpack-alioss-acl-plugin)

插件基于开源项目 [webpack-alioss-plugin](https://github.com/borenXue/webpack-alioss-plugin)，由于公司项目要求上传 OSS 后修改文件的权限，所以本插件在此基础上添加 ACL 的配置项，以及在 put 请求之后追加 putACL 请求

## 安装

```
npm install -D webpack-alioss-acl-plugin
```

## 使用示例 - vue.config.js 示例

```js
const WebpackAliossPlugin = require('webpack-alioss-acl-plugin');
const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  publicPath: isProduction ? '//xx.com/auto_upload_ci/your-project-name/' : '',
  configureWebpack: {
    plugins: isProduction ? [
      new WebpackAliossPlugin({
        auth: {
          accessKeyId: '', // 在阿里 OSS 控制台获取
          accessKeySecret: '', // 在阿里 OSS 控制台获取
          region: 'oss-cn-hangzhou', // OSS 服务节点, 示例: oss-cn-hangzhou
          bucket: 'abc', // OSS 存储空间, 在阿里 OSS 控制台获取
        },
        ossBaseDir: 'auto_upload_ci',
        project: 'my-project-name', // 项目名(用于存放文件的直接目录)
        acl: 'piblic-read', // 设置文件访问权限
      }),
    ] : [],
  },
};
```

## 参数说明

| 构造参数 | 默认值 | 说明 |
| --- | --- | --- |
| acl | '' | 设置文件权限，可选 private/public-read/public-read-write，不传则保持默认权限 |

其他参数同 [webpack-alioss-plugin](https://github.com/borenXue/webpack-alioss-plugin)
