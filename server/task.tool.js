import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { notify } from './desktop_notification.tool.js';

const TASKS_FILE = path.join(process.cwd(), 'data', 'tasks.json');

async function ensureTasksFile() {
  try {
    await fs.mkdir(path.dirname(TASKS_FILE), { recursive: true });
    try {
      await fs.access(TASKS_FILE);
    } catch {
      await fs.writeFile(TASKS_FILE, JSON.stringify([], null, 2));
    }
  } catch (error) {
    console.error('Error ensuring tasks file:', error);
  }
}

async function loadTasks() {
  await ensureTasksFile();
  const data = await fs.readFile(TASKS_FILE, 'utf8');
  return JSON.parse(data);
}

async function saveTasks(tasks) {
  await fs.writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

export async function addTask(title, description = '', priority = 'medium', dueDate = null, tags = []) {
  try {
    const tasks = await loadTasks();
    
    const newTask = {
      id: randomUUID(),
      title,
      description,
      priority,
      dueDate,
      tags: Array.isArray(tags) ? tags : [],
      completed: false,
      createdAt: new Date().toISOString(),
      completedAt: null
    };

    tasks.push(newTask);
    await saveTasks(tasks);
     await notify('✅ Task Added', `${title} (${priority}) – due ${dueDate ? new Date(dueDate).toLocaleDateString() : 'no due date'}`);

    return {
      content: [{
        type: "text",
        text: `✅ Task added successfully!\n\n📝 **${title}**\nPriority: ${priority}\n${dueDate ? `Due: ${new Date(dueDate).toLocaleDateString()}` : 'No due date'}\nID: ${newTask.id}`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ Failed to add task: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function listTasks(filter = 'all', sortBy = 'createdAt') {
  try {
    let tasks = await loadTasks();

    // Apply filters
    if (filter === 'pending') {
      tasks = tasks.filter(t => !t.completed);
    } else if (filter === 'completed') {
      tasks = tasks.filter(t => t.completed);
    } else if (filter === 'high') {
      tasks = tasks.filter(t => t.priority === 'high' && !t.completed);
    } else if (filter === 'overdue') {
      const now = new Date();
      tasks = tasks.filter(t => !t.completed && t.dueDate && new Date(t.dueDate) < now);
    }

    // Sort tasks
    tasks.sort((a, b) => {
      if (sortBy === 'priority') {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      } else if (sortBy === 'dueDate') {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    if (tasks.length === 0) {
      return {
        content: [{
          type: "text",
          text: `📝 No tasks found for filter: ${filter}`
        }]
      };
    }

    let output = `📝 **Tasks (${tasks.length})**\n\n`;
    tasks.forEach((task, i) => {
      const status = task.completed ? '✅' : '⬜';
      const priorityEmoji = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢';
      
      output += `${i + 1}. ${status} ${priorityEmoji} **${task.title}**\n`;
      if (task.description) output += `   ${task.description}\n`;
      if (task.dueDate) {
        const dueDate = new Date(task.dueDate);
        const isOverdue = dueDate < new Date() && !task.completed;
        output += `   📅 Due: ${dueDate.toLocaleDateString()} ${isOverdue ? '⚠️ OVERDUE' : ''}\n`;
      }
      if (task.tags.length > 0) output += `   🏷️ ${task.tags.join(', ')}\n`;
      output += `   ID: ${task.id}\n\n`;
    });

    return {
      content: [{
        type: "text",
        text: output
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ Failed to list tasks: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function completeTask(taskId) {
  try {
    const tasks = await loadTasks();
    const task = tasks.find(t => t.id === taskId || t.id.startsWith(taskId));

    if (!task) {
      return {
        content: [{
          type: "text",
          text: `❌ Task not found with ID: ${taskId}`
        }],
        isError: true
      };
    }

    task.completed = true;
    task.completedAt = new Date().toISOString();
    await saveTasks(tasks);
     await notify('✅ Task Completed', `${task.title}`);

    return {
      content: [{
        type: "text",
        text: `✅ Task completed: **${task.title}**`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ Failed to complete task: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function deleteTask(taskId) {
  try {
    const tasks = await loadTasks();
    const taskIndex = tasks.findIndex(t => t.id === taskId || t.id.startsWith(taskId));

    if (taskIndex === -1) {
      return {
        content: [{
          type: "text",
          text: `❌ Task not found with ID: ${taskId}`
        }],
        isError: true
      };
    }

    const deletedTask = tasks.splice(taskIndex, 1)[0];
    await saveTasks(tasks);

    return {
      content: [{
        type: "text",
        text: `🗑️ Task deleted: **${deletedTask.title}**`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ Failed to delete task: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function updateTask(taskId, updates) {
  try {
    const tasks = await loadTasks();
    const task = tasks.find(t => t.id === taskId || t.id.startsWith(taskId));

    if (!task) {
      return {
        content: [{
          type: "text",
          text: `❌ Task not found with ID: ${taskId}`
        }],
        isError: true
      };
    }

    // Update allowed fields
    if (updates.title) task.title = updates.title;
    if (updates.description !== undefined) task.description = updates.description;
    if (updates.priority) task.priority = updates.priority;
    if (updates.dueDate !== undefined) task.dueDate = updates.dueDate;
    if (updates.tags) task.tags = updates.tags;

    await saveTasks(tasks);

    return {
      content: [{
        type: "text",
        text: `✅ Task updated: **${task.title}**`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ Failed to update task: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function getTaskStats() {
  try {
    const tasks = await loadTasks();
    
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const pending = total - completed;
    const high = tasks.filter(t => t.priority === 'high' && !t.completed).length;
    const overdue = tasks.filter(t => {
      return !t.completed && t.dueDate && new Date(t.dueDate) < new Date();
    }).length;

    let output = `📊 **Task Statistics**\n\n`;
    output += `Total Tasks: ${total}\n`;
    output += `✅ Completed: ${completed}\n`;
    output += `⬜ Pending: ${pending}\n`;
    output += `🔴 High Priority: ${high}\n`;
    output += `⚠️ Overdue: ${overdue}\n`;

    if (total > 0) {
      const completionRate = ((completed / total) * 100).toFixed(1);
      output += `\n📈 Completion Rate: ${completionRate}%`;
    }

    return {
      content: [{
        type: "text",
        text: output
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ Failed to get stats: ${error.message}`
      }],
      isError: true
    };
  }
}