# 统信UOS系统安装包构建说明

## 重要提示
我们已经更新了配置以支持构建统信UOS系统的deb安装包。现在您需要在支持Linux包构建的环境中进行构建。

## 方法一：使用WSL2（推荐）

### 1. 启用WSL2（如果尚未启用）
在PowerShell中以管理员身份运行：
```powershell
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
```
重启电脑后，设置WSL2为默认版本：
```powershell
wsl --set-default-version 2
```

### 2. 安装Ubuntu
从Microsoft Store安装Ubuntu

### 3. 在WSL2中安装依赖
```bash
sudo apt update
sudo apt install -y rpm dpkg fakeroot
```

### 4. 在WSL2中构建
将项目复制到WSL2环境，然后运行：
```bash
npm install
npm run build
npm run dist:linux:deb
```

## 方法二：使用Docker

### 1. 安装Docker Desktop
确保启用了WSL2后端

### 2. 构建命令
```bash
# 使用electron-userland/builder镜像
docker run --rm -ti \
  --env-file <(env | grep -i -E 'DEBUG|NODE_|ELECTRON_|YARN_|NPM_|CI|CIRCLE|TRAVIS_TAG|TRAVIS|TRAVIS_REPO_|TRAVIS_BUILD_|TRAVIS_BRANCH|TRAVIS_PULL_REQUEST_|APPVEYOR_|CSC_|GH_|GITHUB_|BT_|NODE_|TAURI_|NIX_') \
  --env ELECTRON_CACHE="/root/.cache/electron" \
  --env ELECTRON_BUILDER_CACHE="/root/.cache/electron-builder" \
  -v ${PWD}:/project \
  -v ${PWD##*/}-node-modules:/project/node_modules \
  -w /project \
  electronuserland/builder:wine \
  /bin/bash -c "npm install && npm run build && npm run dist:linux:deb"
```

## 方法三：在统信UOS系统上直接构建（最简单）

如果您有统信UOS系统的访问权限，这是最简单的方法：
```bash
# 在统信UOS系统上
npm install
npm run build
npm run dist:linux:deb
```

## 当前配置变更

我们已经完成了以下配置变更：

### 1. electron-builder.yml
- 添加了 Linux 平台支持，目标格式包括 deb 和 AppImage
- 配置了统信UOS系统所需的依赖包（如 gconf2, libnotify4 等）
- 设置了包维护者信息和描述信息
- 配置了安装和卸载后执行的脚本

### 2. package.json
- 添加了 homepage、author（包含邮箱）等必要信息
- 新增了专门用于Linux打包的命令：
  - `dist:win` - 仅构建Windows版本
  - `dist:linux` - 构建所有Linux格式
  - `dist:linux:deb` - 仅构建Linux deb格式

### 3. 图标文件
- 在 `build/icon.png` 位置放置了一个合适的PNG图标文件

### 4. 脚本文件
- `build/linux/after-install.sh` - 安装后执行的脚本
- `build/linux/after-remove.sh` - 卸载后执行的脚本

## 输出文件位置

构建成功后，deb包将位于 `dist-electron/` 目录下，文件名类似：
`invoice-parse-upload-tool_1.0.0_amd64.deb`

## 验证构建

在Linux环境（WSL2或统信UOS）中运行以下命令验证构建：
```bash
# 检查deb包内容
dpkg-deb -c invoice-parse-upload-tool_1.0.0_amd64.deb

# 检查deb包信息
dpkg-deb -I invoice-parse-upload-tool_1.0.0_amd64.deb
```

这个deb包将兼容统信UOS系统，可以使用以下命令安装：
```bash
sudo dpkg -i invoice-parse-upload-tool_1.0.0_amd64.deb
```