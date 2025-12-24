#!/bin/bash
# 卸载后执行的脚本

# 清理桌面快捷方式（如果需要）
if [ -f /usr/share/applications/invoice-parse-upload-tool.desktop ]; then
    rm -f /usr/share/applications/invoice-parse-upload-tool.desktop
fi

# 更新桌面数据库
update-desktop-database /usr/share/applications/ 2>/dev/null || true

# 退出状态
exit 0