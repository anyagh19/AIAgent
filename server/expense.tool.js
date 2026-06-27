import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { notify } from './desktop_notification.tool.js';
const EXPENSES_FILE = path.join(process.cwd(), 'data', 'expenses.json');

async function ensureExpensesFile() {
  try {
    await fs.mkdir(path.dirname(EXPENSES_FILE), { recursive: true });
    try {
      await fs.access(EXPENSES_FILE);
    } catch {
      await fs.writeFile(EXPENSES_FILE, JSON.stringify([], null, 2));
    }
  } catch (error) {
    console.error('Error ensuring expenses file:', error);
  }
}

export async function loadExpenses() {
  await ensureExpensesFile();
  const data = await fs.readFile(EXPENSES_FILE, 'utf8');
  return JSON.parse(data);
}

export async function saveExpenses(expenses) {
  await fs.writeFile(EXPENSES_FILE, JSON.stringify(expenses, null, 2));
}

export async function logExpense(amount, category, description = '', date = null) {
  try {
    const expenses = await loadExpenses();

    const expense = {
      id: randomUUID(),
      amount: parseFloat(amount),
      category: category.toLowerCase(),
      description,
      date: date || new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    expenses.push(expense);
    await saveExpenses(expenses);
    await notify('💰 Expense Logged', `${category}: $${amount} – ${description || 'No description'}`);
    return {
      content: [{
        type: "text",
        text: `✅ Expense logged!\n\n💰 $${expense.amount}\n📁 Category: ${expense.category}\n${expense.description ? `📝 ${expense.description}\n` : ''}📅 ${new Date(expense.date).toLocaleDateString()}\n\nID: ${expense.id}`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ Failed to log expense: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function getSpendingSummary(period = 'month', year = null, month = null) {
  try {
    const expenses = await loadExpenses();
    const now = new Date();

    let filteredExpenses = expenses;

    if (period === 'month') {
      const targetYear = year || now.getFullYear();
      const targetMonth = month !== null ? month : now.getMonth();

      filteredExpenses = expenses.filter(e => {
        const date = new Date(e.date);
        return date.getFullYear() === targetYear && date.getMonth() === targetMonth;
      });
    } else if (period === 'year') {
      const targetYear = year || now.getFullYear();
      filteredExpenses = expenses.filter(e => {
        const date = new Date(e.date);
        return date.getFullYear() === targetYear;
      });
    } else if (period === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      filteredExpenses = expenses.filter(e => new Date(e.date) >= weekAgo);
    }

    if (filteredExpenses.length === 0) {
      return {
        content: [{
          type: "text",
          text: `💰 No expenses found for this ${period}`
        }]
      };
    }

    // Calculate totals
    const total = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Group by category
    const byCategory = {};
    filteredExpenses.forEach(e => {
      if (!byCategory[e.category]) {
        byCategory[e.category] = 0;
      }
      byCategory[e.category] += e.amount;
    });

    const periodLabel = period === 'month'
      ? new Date(year || now.getFullYear(), month !== null ? month : now.getMonth()).toLocaleString('default', { month: 'long', year: 'numeric' })
      : period === 'year'
        ? (year || now.getFullYear()).toString()
        : 'Last 7 days';

    let output = `💰 **Spending Summary - ${periodLabel}**\n\n`;
    output += `**Total Spent:** $${total.toFixed(2)}\n`;
    output += `**Transactions:** ${filteredExpenses.length}\n`;
    output += `**Average:** $${(total / filteredExpenses.length).toFixed(2)}\n\n`;
    output += `**By Category:**\n`;

    Object.entries(byCategory)
      .sort(([, a], [, b]) => b - a)
      .forEach(([category, amount]) => {
        const percentage = ((amount / total) * 100).toFixed(1);
        output += `• ${category}: $${amount.toFixed(2)} (${percentage}%)\n`;
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
        text: `❌ Failed to get spending summary: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function listExpenses(limit = 20, category = null) {
  try {
    let expenses = await loadExpenses();

    if (category) {
      expenses = expenses.filter(e => e.category === category.toLowerCase());
    }

    // Sort by date descending
    expenses.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (expenses.length === 0) {
      return {
        content: [{
          type: "text",
          text: category
            ? `💰 No expenses found in category: ${category}`
            : `💰 No expenses logged yet. Start tracking your spending!`
        }]
      };
    }

    let output = `💰 **Recent Expenses**${category ? ` [${category}]` : ''}\n\n`;

    expenses.slice(0, limit).forEach((expense, i) => {
      output += `${i + 1}. $${expense.amount.toFixed(2)} - ${expense.category}\n`;
      if (expense.description) output += `   ${expense.description}\n`;
      output += `   📅 ${new Date(expense.date).toLocaleDateString()}\n`;
      output += `   ID: ${expense.id}\n\n`;
    });

    const total = expenses.slice(0, limit).reduce((sum, e) => sum + e.amount, 0);
    output += `**Total (${Math.min(limit, expenses.length)} items): $${total.toFixed(2)}**`;

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
        text: `❌ Failed to list expenses: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function deleteExpense(expenseId) {
  try {
    const expenses = await loadExpenses();
    const index = expenses.findIndex(e => e.id === expenseId || e.id.startsWith(expenseId));

    if (index === -1) {
      return {
        content: [{
          type: "text",
          text: `❌ Expense not found with ID: ${expenseId}`
        }],
        isError: true
      };
    }

    const deleted = expenses.splice(index, 1)[0];
    await saveExpenses(expenses);

    return {
      content: [{
        type: "text",
        text: `🗑️ Expense deleted: $${deleted.amount} - ${deleted.category}`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ Failed to delete expense: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function getExpenseStats() {
  try {
    const expenses = await loadExpenses();

    if (expenses.length === 0) {
      return {
        content: [{
          type: "text",
          text: `💰 No expense data available yet`
        }]
      };
    }

    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    const average = total / expenses.length;

    // Find highest and lowest
    const highest = expenses.reduce((max, e) => e.amount > max.amount ? e : max);
    const lowest = expenses.reduce((min, e) => e.amount < min.amount ? e : min);

    // This month
    const now = new Date();
    const thisMonth = expenses.filter(e => {
      const date = new Date(e.date);
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    });
    const thisMonthTotal = thisMonth.reduce((sum, e) => sum + e.amount, 0);

    let output = `💰 **Expense Statistics**\n\n`;
    output += `**All Time:**\n`;
    output += `• Total Spent: $${total.toFixed(2)}\n`;
    output += `• Transactions: ${expenses.length}\n`;
    output += `• Average: $${average.toFixed(2)}\n`;
    output += `• Highest: $${highest.amount.toFixed(2)} (${highest.category})\n`;
    output += `• Lowest: $${lowest.amount.toFixed(2)} (${lowest.category})\n\n`;
    output += `**This Month:**\n`;
    output += `• Total: $${thisMonthTotal.toFixed(2)}\n`;
    output += `• Transactions: ${thisMonth.length}`;

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
        text: `❌ Failed to get expense stats: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function exportExpenses(format = 'csv') {
  try {
    const expenses = await loadExpenses();

    if (expenses.length === 0) {
      return {
        content: [{
          type: "text",
          text: `💰 No expenses to export`
        }]
      };
    }

    let output = '';

    if (format === 'csv') {
      output = 'Date,Category,Amount,Description\n';
      expenses.forEach(e => {
        const date = new Date(e.date).toLocaleDateString();
        const desc = e.description.replace(/,/g, ';');
        output += `${date},${e.category},${e.amount},"${desc}"\n`;
      });
    } else {
      output = JSON.stringify(expenses, null, 2);
    }

    const exportPath = path.join(process.cwd(), 'data', `expenses-export-${Date.now()}.${format}`);
    await fs.writeFile(exportPath, output);

    return {
      content: [{
        type: "text",
        text: `✅ Expenses exported!\n\nFile: ${exportPath}\nFormat: ${format.toUpperCase()}\nRecords: ${expenses.length}`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `❌ Failed to export expenses: ${error.message}`
      }],
      isError: true
    };
  }
}