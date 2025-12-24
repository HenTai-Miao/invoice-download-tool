import axios from 'axios';

// 创建 axios 实例
const apiClient = axios.create({
  baseURL: 'http://127.0.0.1:8082'
});

// 机器人控制 API
// 查询招标项目列表
export const robotApi = ((params: object) => {
    return apiClient.get('/api/invoice/trigger', {
        params: params
    })
})