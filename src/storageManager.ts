import * as vscode from 'vscode';
import { AppData, Prompt, StorageInfo } from './types';

/**
 * 存储管理器 - 负责核心数据存储和CRUD操作
 * 
 * 职责：
 * - 核心数据的读取和保存
 * - 工作区模式管理
 * - Prompt的CRUD操作
 * - 分类和标签管理
 */
export class StorageManager {
    private static readonly STORAGE_KEYS = {
        APP_DATA: 'promptHub.appData',
        WORKSPACE_DATA: 'promptHub.workspaceData',
        BACKUP_HISTORY: 'promptHub.backupHistory'
    };

    constructor(private context: vscode.ExtensionContext) {}

    // #region Core Data Handling
    public async getAppData(): Promise<AppData> {
        const defaultData: AppData = {
            prompts: [],
            categories: [],
            settings: {
                autoBackup: true,
                backupInterval: 30,
                cloudSync: false,
                autoSync: false,
                syncProvider: null,
                workspaceMode: false
            },
            metadata: {
                version: '1.0.0',
                lastModified: new Date().toISOString(),
                totalPrompts: 0
            }
        };

        try {
            let savedData: AppData | undefined;
            const globalData = this.context.globalState.get<AppData>(StorageManager.STORAGE_KEYS.APP_DATA);
            const workspaceData = this.context.workspaceState.get<AppData>(StorageManager.STORAGE_KEYS.WORKSPACE_DATA);

            // Determine current settings owner
            const settingsOwner = workspaceData?.settings.workspaceMode ? workspaceData : globalData;

            if (settingsOwner?.settings.workspaceMode) {
                savedData = workspaceData;
            } else {
                savedData = globalData;
            }
            
            if (savedData) {
                savedData.categories = savedData.categories || defaultData.categories;
                const mergedData = {
                    ...defaultData,
                    ...savedData,
                    settings: { ...defaultData.settings, ...savedData.settings },
                    metadata: { ...defaultData.metadata, ...savedData.metadata, totalPrompts: savedData.prompts?.length || 0 }
                };
                return mergedData;
            }

            // 首次运行：如果没有任何存储数据，加载预设数据并保存到存储中
            console.log('[StorageManager] First run detected. Loading preset data...');
            const presetData = this.getDefaultDataWithPresets();
            await this.saveAppData(presetData);
            console.log('[StorageManager] Preset data loaded and saved successfully');
            return presetData;
        } catch (error) {
            console.error('[StorageManager] CRITICAL: Error while getting AppData. Returning default data.', error);
            return defaultData;
        }
    }

    public async saveAppData(data: AppData): Promise<void> {
        data.metadata = { ...data.metadata, lastModified: new Date().toISOString(), totalPrompts: data.prompts.length };

        if (data.settings.workspaceMode) {
            await this.context.workspaceState.update(StorageManager.STORAGE_KEYS.WORKSPACE_DATA, data);
        } else {
            await this.context.globalState.update(StorageManager.STORAGE_KEYS.APP_DATA, data);
        }
    }

    public async getPrompts(): Promise<Prompt[]> {
        const appData = await this.getAppData();
        return appData.prompts || [];
    }

    public async getAllTags(): Promise<string[]> {
        const appData = await this.getAppData();
        const allTags = new Set<string>();
        if (appData.prompts) {
            for (const prompt of appData.prompts) {
                if (prompt.tags) {
                    for (const tag of prompt.tags) {
                        allTags.add(tag);
                    }
                }
            }
        }
        return Array.from(allTags);
    }

    public async updateSetting(key: string, value: any): Promise<void> {
        const appData = await this.getAppData();
        
        // Type-safe way to update settings
        if (key in appData.settings) {
            (appData.settings as any)[key] = value;
            await this.saveAppData(appData);
        } else {
            console.warn(`[StorageManager] Attempted to update a non-existent setting: ${key}`);
            throw new Error(`Setting ${key} not found.`);
        }
    }
    // #endregion

    // #region Workspace Mode
    public async toggleWorkspaceMode(enable: boolean): Promise<void> {
        const currentData = await this.getAppData();
        currentData.settings.workspaceMode = enable;
        if (enable) {
            await this.context.workspaceState.update(StorageManager.STORAGE_KEYS.WORKSPACE_DATA, currentData);
            await this.context.globalState.update(StorageManager.STORAGE_KEYS.APP_DATA, undefined);
        } else {
            await this.context.globalState.update(StorageManager.STORAGE_KEYS.APP_DATA, currentData);
            await this.context.workspaceState.update(StorageManager.STORAGE_KEYS.WORKSPACE_DATA, undefined);
        }
    }

    public async getStorageInfo(): Promise<StorageInfo> {
        const data = await this.getAppData();
        return {
            mode: data.settings.workspaceMode ? 'workspace' : 'global',
            location: data.settings.workspaceMode ? '工作区' : '全局'
        };
    }
    // #endregion

    // #region CRUD Operations
    public async savePrompt(promptData: Partial<Prompt> & { id?: string | number }): Promise<AppData> {
        if (!promptData) {
            throw new Error('Attempted to save invalid prompt data.');
        }

        const appData = await this.getAppData();
        const now = new Date().toISOString();

        if (promptData.id) {
            const promptId = Number(promptData.id);
            const promptIndex = appData.prompts.findIndex(p => p.id === promptId);
            if (promptIndex > -1) {
                appData.prompts[promptIndex] = { ...appData.prompts[promptIndex], ...promptData, id: promptId, updatedAt: now };
            }
        } else {
            const newPrompt: Prompt = {
                id: Date.now(),
                title: promptData.title || '无标题',
                content: promptData.content || '',
                category: promptData.category || '',
                tags: promptData.tags || [],
                isActive: promptData.isActive === false ? false : true,
                createdAt: now,
                updatedAt: now,
            };
            appData.prompts.push(newPrompt);
        }

        if (promptData.category && !appData.categories.includes(promptData.category)) {
            appData.categories.push(promptData.category);
        }
        await this.saveAppData(appData);
        return appData;
    }
    
    public async deletePrompt(promptId: number | string): Promise<void> {
        const appData = await this.getAppData();
        appData.prompts = appData.prompts.filter(p => p.id != promptId);
        await this.saveAppData(appData);
    }

    public async getCategoryPromptCount(categoryName: string): Promise<number> {
        const appData = await this.getAppData();
        return appData.prompts.filter(p => p.category === categoryName).length;
    }

    public async addCategory(categoryName: string): Promise<AppData> {
        const appData = await this.getAppData();
        if (!categoryName || categoryName.trim() === '') {
            throw new Error('分类名称不能为空。');
        }
        if (appData.categories.includes(categoryName)) {
            throw new Error(`分类 "${categoryName}" 已存在.`);
        }
        appData.categories.push(categoryName);
        await this.saveAppData(appData);
        return appData;
    }

    public async renameCategory(oldName: string, newName: string): Promise<AppData> {
        const appData = await this.getAppData();
        const index = appData.categories.indexOf(oldName);
        if (index > -1) {
            appData.categories[index] = newName;
            appData.prompts.forEach(p => {
                if (p.category === oldName) {
                    p.category = newName;
                }
            });
            await this.saveAppData(appData);
        }
        return appData;
    }

    public async deleteCategory(categoryName: string): Promise<AppData> {
        const appData = await this.getAppData();
        appData.categories = appData.categories.filter(c => c !== categoryName);
        appData.prompts.forEach(p => {
            if (p.category === categoryName) {
                p.category = ''; 
            }
        });
        await this.saveAppData(appData);
        return appData;
    }
    
    public async deleteTag(tagName: string): Promise<AppData> {
        const appData = await this.getAppData();
        appData.prompts.forEach(p => {
            if (p.tags) {
                p.tags = p.tags.filter(t => t !== tagName);
            }
        });
        await this.saveAppData(appData);
        return appData;
    }

    public async setPromptActive(promptId: string | number, isActive: boolean): Promise<void> {
        const id = Number(promptId);
        const appData = await this.getAppData();
        const prompt = appData.prompts.find(p => p.id === id);
        if (prompt) {
            prompt.isActive = isActive;
            await this.saveAppData(appData);
        }
    }
    // #endregion

    // #region Data Reset
    /**
     * 重置所有数据为默认值
     * 包含预设的软件开发生命周期相关的分类、提示词和标签
     * @returns Promise<AppData> 重置后的应用数据
     */
    public async resetAllData(): Promise<AppData> {
        try {
            const defaultData: AppData = this.getDefaultDataWithPresets();
            
            // 清除所有存储数据
            await this.context.globalState.update(StorageManager.STORAGE_KEYS.APP_DATA, undefined);
            await this.context.workspaceState.update(StorageManager.STORAGE_KEYS.WORKSPACE_DATA, undefined);
            await this.context.globalState.update(StorageManager.STORAGE_KEYS.BACKUP_HISTORY, undefined);
            
            // 保存默认数据
            await this.saveAppData(defaultData);
            
            console.log('[StorageManager] 所有数据已重置为默认值');
            return defaultData;
        } catch (error) {
            console.error('[StorageManager] 重置所有数据失败:', error);
            throw new Error(`重置数据失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 清空所有数据
     * 只保留默认设置，不包含任何示例数据
     * @returns Promise<AppData> 清空后的应用数据
     */
    public async clearAllData(): Promise<AppData> {
        try {
            const defaultData: AppData = this.getEmptyDefaultData();
            
            // 清除所有存储数据
            await this.context.globalState.update(StorageManager.STORAGE_KEYS.APP_DATA, undefined);
            await this.context.workspaceState.update(StorageManager.STORAGE_KEYS.WORKSPACE_DATA, undefined);
            await this.context.globalState.update(StorageManager.STORAGE_KEYS.BACKUP_HISTORY, undefined);
            
            // 保存空的默认数据
            await this.saveAppData(defaultData);
            
            console.log('[StorageManager] 所有数据已清空');
            return defaultData;
        } catch (error) {
            console.error('[StorageManager] 清空所有数据失败:', error);
            throw new Error(`清空数据失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 获取包含预设数据的默认应用数据
     * 预设数据围绕软件开发生命周期：需求分析、系统设计、UI设计、开发实现
     * @returns AppData 包含预设数据的默认应用数据
     */
    private getDefaultDataWithPresets(): AppData {
        const now = new Date().toISOString();
        
        // 预设分类 - 软件开发生命周期
        const categories = [
            '需求分析',
            '系统设计', 
            'UI设计',
            '开发实现'
        ];
        
        // 预设提示词 - 针对各个开发阶段
        const prompts: Prompt[] = [
            // 需求分析阶段
            {
                id: 1,
                title: '需求调研模板',
                content: `请协助我进行项目需求调研，需要包含以下方面：

## 项目背景
- 项目目标和价值主张
- 目标用户群体分析
- 市场和竞品分析

## 功能需求
- 核心功能列表
- 功能优先级排序
- 用户故事和用例

## 非功能需求
- 性能要求
- 安全性要求
- 兼容性要求
- 可扩展性要求

## 技术约束
- 技术栈选型
- 部署环境
- 预算和时间限制

请基于以上框架，帮我分析当前项目的需求。`,
                category: '需求分析',
                tags: ['需求调研', '项目分析', '用户故事'],
                isActive: true,
                createdAt: now,
                updatedAt: now
            },
            {
                id: 2,
                title: 'PRD文档编写助手',
                content: `请协助我编写产品需求文档(PRD)，文档结构如下：

## 1. 产品概述
- 产品定位和目标
- 核心价值主张

## 2. 功能规格说明
- 功能模块划分
- 详细功能描述
- 业务流程图

## 3. 用户体验设计
- 用户角色定义
- 使用场景描述
- 交互流程设计

## 4. 技术需求
- 性能指标要求
- 接口规范说明
- 数据库设计要求

## 5. 验收标准
- 功能验收条件
- 性能验收标准
- 用户体验验收要求

请基于我提供的需求信息，帮我完善PRD文档。`,
                category: '需求分析',
                tags: ['PRD', '产品设计', '文档编写'],
                isActive: true,
                createdAt: now,
                updatedAt: now
            },
            
            // 系统设计阶段
            {
                id: 3,
                title: '系统架构设计',
                content: `请协助我设计系统架构，需要考虑以下方面：

## 整体架构
- 系统分层设计（表现层、业务层、数据层）
- 模块化设计原则
- 组件间通信方式

## 技术架构
- 前端技术栈：Vue.js生态系统
- 后端技术栈：基于FastAdmin框架
- 数据库设计：MySQL/Redis
- 缓存策略设计

## 接口设计
- RESTful API设计规范
- 接口文档规范
- 错误处理机制
- 版本控制策略

## 安全设计
- 身份认证和授权
- 数据加密策略
- 防护措施设计

## 部署架构
- 服务器架构设计
- 负载均衡策略
- 监控和日志策略

请基于项目需求，为我设计合适的系统架构方案。`,
                category: '系统设计',
                tags: ['架构设计', '技术选型', 'API设计'],
                isActive: true,
                createdAt: now,
                updatedAt: now
            },
            {
                id: 4,
                title: '数据库设计助手',
                content: `请协助我进行数据库设计，包含以下内容：

## 概念设计
- 实体关系分析(ER图)
- 业务规则识别
- 数据流向分析

## 逻辑设计
- 表结构设计
- 字段类型和约束
- 索引设计策略
- 关系设计(一对一、一对多、多对多)

## 物理设计
- 存储引擎选择
- 分区策略
- 性能优化考虑

## 数据安全
- 敏感数据处理
- 备份恢复策略
- 访问权限控制

## 示例SQL
\\\`\\\`\\\`sql
-- 用户表示例
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
\\\`\\\`\\\`

请基于业务需求，帮我设计完整的数据库结构。`,
                category: '系统设计',
                tags: ['数据库设计', 'SQL', '数据建模'],
                isActive: true,
                createdAt: now,
                updatedAt: now
            },
            
            // UI设计阶段
            {
                id: 5,
                title: 'UI设计规范制定',
                content: `请协助我制定UI设计规范，确保界面的一致性和用户体验：

## 设计原则
- 简洁性：界面清晰，信息层次分明
- 一致性：保持视觉和交互的统一
- 可用性：符合用户使用习惯
- 可访问性：支持无障碍访问

## 视觉规范
- 色彩搭配方案
- 字体系统规范
- 图标设计标准
- 间距和布局网格

## 组件规范
- 按钮样式和状态
- 表单控件规范
- 导航组件设计
- 反馈组件(Toast、Modal等)

## 响应式设计
- 断点设置标准
- 移动端适配方案
- 触摸友好的交互设计

## 品牌一致性
- Logo使用规范
- 品牌色彩应用
- 视觉语言统一

请基于项目特点，帮我建立完整的UI设计规范体系。`,
                category: 'UI设计',
                tags: ['设计规范', 'UI标准', '用户体验'],
                isActive: true,
                createdAt: now,
                updatedAt: now
            },
            {
                id: 6,
                title: '原型设计指导',
                content: `请协助我进行原型设计，从概念到高保真原型的完整流程：

## 需求分析阶段
- 用户需求梳理
- 功能点优先级排序
- 用户流程图设计

## 信息架构设计
- 网站地图/应用结构
- 导航系统设计
- 内容组织策略

## 线框图设计
- 页面布局规划
- 功能模块划分
- 交互流程设计

## 高保真原型
- 视觉设计应用
- 交互动效设计
- 响应式适配

## 原型测试
- 可用性测试计划
- 用户反馈收集
- 迭代优化方案

## 交付文档
- 设计说明文档
- 交互规范文档
- 开发标注文档

请基于项目需求，指导我完成原型设计的各个阶段。`,
                category: 'UI设计',
                tags: ['原型设计', '用户体验', '交互设计'],
                isActive: true,
                createdAt: now,
                updatedAt: now
            },
            
            // 开发实现阶段
            {
                id: 7,
                title: 'Vue.js开发最佳实践',
                content: `请协助我使用Vue.js进行前端开发，遵循最佳实践：

## 项目结构规范
- 目录结构组织
- 组件文件命名
- 路由和状态管理

## 组件开发规范
- 组件设计原则（单一职责、可复用）
- Props和Events定义
- 生命周期方法使用
- 样式作用域和预处理器

## 状态管理
- Vuex/Pinia使用策略
- 模块化状态管理
- 异步操作处理

## 性能优化
- 懒加载和代码分割
- 组件缓存策略
- 虚拟滚动优化
- 打包优化配置

## 代码示例
\\\`\\\`\\\`vue
<template>
  <div class="component-name">
    <slot name="header"></slot>
    <div class="content">{{ formattedData }}</div>
  </div>
</template>

<script>
export default {
  name: 'ComponentName',
  props: {
    data: {
      type: Object,
      required: true
    }
  },
  computed: {
    formattedData() {
      return this.formatData(this.data);
    }
  }
}
</script>
\\\`\\\`\\\`

请基于具体需求，指导我实现Vue.js组件和功能。`,
                category: '开发实现',
                tags: ['Vue.js', '前端开发', '最佳实践'],
                isActive: true,
                createdAt: now,
                updatedAt: now
            },
            {
                id: 8,
                title: 'FastAdmin后端开发指南',
                content: `请协助我使用FastAdmin框架进行后端开发：

## FastAdmin框架特点
- 基于ThinkPHP的快速开发框架
- 内置权限管理系统
- 丰富的插件生态
- 自动CRUD生成

## 开发流程
- 数据表设计和创建
- 模型(Model)定义
- 控制器(Controller)编写
- 视图(View)模板开发

## 核心功能开发
- 用户认证和权限控制
- 数据验证和安全处理
- 文件上传和管理
- 缓存和性能优化

## API开发规范
- RESTful接口设计
- 请求参数验证
- 响应数据格式统一
- 错误处理机制

## 代码示例
\\\`\\\`\\\`php
<?php
namespace app\\\\admin\\\\controller;

use app\\\\common\\\\controller\\\\Backend;

class Example extends Backend
{
    protected \\$model = null;
    
    public function _initialize()
    {
        parent::_initialize();
        \\$this->model = new \\\\app\\\\admin\\\\model\\\\Example;
    }
    
    public function index()
    {
        if (\\$this->request->isAjax()) {
            // Ajax列表数据处理
            list(\\$where, \\$sort, \\$order, \\$offset, \\$limit) = \\$this->buildparams();
            \\$total = \\$this->model->where(\\$where)->count();
            \\$list = \\$this->model->where(\\$where)->order(\\$sort, \\$order)->limit(\\$offset, \\$limit)->select();
            return json(['total' => \\$total, 'rows' => \\$list]);
        }
        return \\$this->view->fetch();
    }
}
\\\`\\\`\\\`

请基于具体业务需求，指导我实现FastAdmin后端功能。`,
                category: '开发实现',
                tags: ['FastAdmin', '后端开发', 'PHP框架'],
                isActive: true,
                createdAt: now,
                updatedAt: now
            }
        ];
        
        return {
            prompts,
            categories,
            settings: {
                autoBackup: true,
                backupInterval: 30,
                cloudSync: false,
                autoSync: false,
                syncProvider: null,
                workspaceMode: false
            },
            metadata: {
                version: '1.0.0',
                lastModified: now,
                totalPrompts: prompts.length
            }
        };
    }

    /**
     * 获取空的默认应用数据
     * 只包含默认设置，不包含任何示例数据
     * @returns AppData 空的默认应用数据
     */
    private getEmptyDefaultData(): AppData {
        const now = new Date().toISOString();
        
        return {
            prompts: [],
            categories: [],
            settings: {
                autoBackup: true,
                backupInterval: 30,
                cloudSync: false,
                autoSync: false,
                syncProvider: null,
                workspaceMode: false
            },
            metadata: {
                version: '1.0.0',
                lastModified: now,
                totalPrompts: 0
            }
        };
    }
    // #endregion
} 