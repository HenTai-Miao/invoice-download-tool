<template>
  <div class="layout">
    <!-- 侧边栏 -->
    <aside class="sidebar">
      <div class="logo">
        <h2>发票解析上传工具</h2>
      </div>
      <nav class="menu">
        <RouterLink to="/invoice-upload" class="menu-item">
          <span class="menu-icon">📤</span>
          <span class="menu-text">发票解析上传</span>
        </RouterLink>
      </nav>
    </aside>

    <!-- 主内容区域 -->
    <main class="main-content">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  margin: 0;
  padding: 0;
}

.sidebar {
  width: 250px;
  background: var(--color-background-soft);
  border-right: 1px solid var(--color-border);
  padding: 20px 0;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  margin: 0;
}

.logo {
  padding: 0 20px 20px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 20px;
  margin-top: 0;
}

.logo h2 {
  margin: 0;
  color: var(--color-heading);
  font-size: 1.5rem;
}

.menu {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  margin: 0;
  padding: 0;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  text-decoration: none;
  color: var(--color-text);
  transition: background-color 0.2s;
  border-left: 3px solid transparent;
  margin: 0;
}

.menu-item:hover {
  background-color: var(--color-background-mute);
}

.menu-item.router-link-exact-active {
  background-color: var(--color-background-mute);
  border-left: 3px solid #42b883;
  color: #42b883;
  font-weight: 500;
}

.menu-icon {
  margin-right: 12px;
  font-size: 1.2rem;
}

.main-content {
  flex: 1;
  overflow: hidden; /* 避免滚动条 */
  background: var(--color-background);
  margin: 0;
  padding: 0;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .layout {
    flex-direction: column;
  }
  
  .sidebar {
    width: 100%;
    height: auto;
    border-right: none;
    border-bottom: 1px solid var(--color-border);
  }
  
  .menu {
    flex-direction: row;
    overflow-x: auto;
  }
  
  .menu-item {
    border-left: none;
    border-bottom: 3px solid transparent;
    white-space: nowrap;
  }
  
  .menu-item.router-link-exact-active {
    border-left: none;
    border-bottom: 3px solid #42b883;
  }
  
  .main-content {
    overflow-y: auto; /* 移动端允许垂直滚动 */
  }
}
</style>