#!/bin/bash
# 安装后执行的脚本

# 创建桌面快捷方式（如果需要）
if [ -f /usr/share/applications/invoice-parse-upload-tool.desktop ]; then
    update-desktop-database /usr/share/applications/
fi

# 设置权限（如果需要）
chmod -R 755 /opt/invoice-parse-upload-tool/ || true

# 退出状态
exit 0