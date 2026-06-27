// finance_advisor.tool.js
import fs from 'fs/promises';
import path from 'path';
import { loadExpenses } from './expense.tool.js'; // ✅ now exported
import { notify } from './desktop_notification.tool.js';
// import { sendMessage } from './whatsapp.tool.js'; // optional – uncomment when WhatsApp is ready

// ── Data files ──
const DATA_DIR = path.join(process.cwd(), 'data');
const BUDGETS_FILE = path.join(DATA_DIR, 'budgets.json');
const BILLS_FILE = path.join(DATA_DIR, 'bills.json');

// ── Ensure files exist ──
async function ensureFile(filePath, defaultContent = {}) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(filePath); } catch {
    await fs.writeFile(filePath, JSON.stringify(defaultContent, null, 2));
  }
}

async function loadBudgets() {
  await ensureFile(BUDGETS_FILE, {});
  const data = await fs.readFile(BUDGETS_FILE, 'utf-8');
  return JSON.parse(data);
}

async function saveBudgets(budgets) {
  await fs.writeFile(BUDGETS_FILE, JSON.stringify(budgets, null, 2));
}

async function loadBills() {
  await ensureFile(BILLS_FILE, []);
  const data = await fs.readFile(BILLS_FILE, 'utf-8');
  return JSON.parse(data);
}

async function saveBills(bills) {
  await fs.writeFile(BILLS_FILE, JSON.stringify(bills, null, 2));
}

// ── 1. Set a budget ──
export async function setBudget(category, limit, period = 'monthly') {
  try {
    const budgets = await loadBudgets();
    budgets[category.toLowerCase()] = { limit: parseFloat(limit), period };
    await saveBudgets(budgets);
    return {
      content: [{ type: 'text', text: `✅ Budget set for "${category}": $${limit} ${period}.` }]
    };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── 2. Budget status with alerts ──
export async function getBudgetStatus() {
  try {
    const expenses = await loadExpenses();
    const budgets = await loadBudgets();
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthlyExpenses = expenses.filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const status = [];
    for (const [cat, { limit }] of Object.entries(budgets)) {
      const spent = monthlyExpenses.filter(e => e.category === cat)
        .reduce((sum, e) => sum + e.amount, 0);
      const remaining = limit - spent;
      const pct = (spent / limit * 100).toFixed(1);
      status.push({ category: cat, spent, limit, remaining, pct });
    }

    let output = `📊 **Budget Status (${currentMonth+1}/${currentYear})**\n\n`;
    if (status.length === 0) {
      output += 'No budgets set. Use `set_budget` to create one.';
    } else {
      for (const s of status) {
        const emoji = s.remaining < 0 ? '🔴' : s.pct > 90 ? '🟡' : '🟢';
        output += `${emoji} **${s.category}**: $${s.spent.toFixed(2)} / $${s.limit} (${s.pct}%) – remaining $${s.remaining.toFixed(2)}\n`;
      }
    }

    // Send notification for over-budget categories
    const overBudget = status.filter(s => s.remaining < 0);
    if (overBudget.length > 0) {
      const msg = `⚠️ Over budget: ${overBudget.map(s => s.category).join(', ')}`;
      await notify('Budget Alert', msg);
      // Optional WhatsApp: await sendMessage('Your Contact', msg);
    }

    return { content: [{ type: 'text', text: output }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── 3. Add a bill (with date validation) ──
export async function addBill(name, amount, dueDate, category = 'bills', recurrence = 'monthly') {
  try {
    const due = new Date(dueDate);
    if (isNaN(due.getTime())) {
      return { content: [{ type: 'text', text: '❌ Invalid date format. Use YYYY-MM-DD.' }], isError: true };
    }
    const now = new Date();
    now.setHours(0, 0, 0, 0); // ignore time
    if (due < now) {
      return {
        content: [{ type: 'text', text: `⚠️ Due date (${due.toLocaleDateString()}) is in the past. Please use a future date.` }],
        isError: true
      };
    }
    const bills = await loadBills();
    const bill = {
      id: Date.now().toString(),
      name,
      amount: parseFloat(amount),
      dueDate: due.toISOString(),
      category: category.toLowerCase(),
      recurrence,
      active: true
    };
    bills.push(bill);
    await saveBills(bills);
    return {
      content: [{ type: 'text', text: `✅ Bill added: "${name}" – $${amount} due ${due.toLocaleDateString()}` }]
    };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── 4. Check upcoming bills (next 7 days) ──
export async function checkUpcomingBills() {
  try {
    const bills = await loadBills();
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7);

    const upcoming = bills.filter(b => {
      const due = new Date(b.dueDate);
      due.setHours(0, 0, 0, 0);
      return due >= now && due <= nextWeek && b.active;
    });

    if (upcoming.length === 0) {
      return { content: [{ type: 'text', text: '📅 No bills due in the next 7 days.' }] };
    }

    let output = `📅 **Upcoming Bills (${upcoming.length})**\n\n`;
    for (const b of upcoming) {
      output += `💰 **${b.name}** – $${b.amount.toFixed(2)}\n`;
      output += `📅 Due: ${new Date(b.dueDate).toLocaleDateString()}\n`;
      output += `📁 ${b.category} (${b.recurrence})\n\n`;
    }

    // Send urgent notifications for bills due in < 2 days
    const urgent = upcoming.filter(b => {
      const diff = (new Date(b.dueDate) - now) / (1000 * 60 * 60 * 24);
      return diff <= 2;
    });
    if (urgent.length > 0) {
      const msg = `🔔 Urgent: ${urgent.map(b => `${b.name} ($${b.amount})`).join(', ')} due in < 2 days.`;
      await notify('Bill Reminder', msg);
      // Optional WhatsApp: await sendMessage('Your Contact', msg);
    }

    return { content: [{ type: 'text', text: output }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── 5. List all bills (past, future, active) ──
export async function listAllBills() {
  try {
    const bills = await loadBills();
    if (bills.length === 0) {
      return { content: [{ type: 'text', text: '📭 No bills saved.' }] };
    }
    let output = `📋 **All Bills (${bills.length})**\n\n`;
    for (const b of bills) {
      const status = b.active ? '✅ Active' : '❌ Inactive';
      const due = new Date(b.dueDate).toLocaleDateString();
      output += `💰 **${b.name}** – $${b.amount.toFixed(2)} (${due})\n`;
      output += `📁 ${b.category} (${b.recurrence}) – ${status}\n\n`;
    }
    return { content: [{ type: 'text', text: output }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── 6. Comprehensive financial health summary ──
export async function getFinancialHealth() {
  try {
    const expenses = await loadExpenses();
    const budgets = await loadBudgets();
    const bills = await loadBills();

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Monthly expenses
    const monthly = expenses.filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
    const totalSpent = monthly.reduce((s, e) => s + e.amount, 0);

    // Budget summary
    let budgetSummary = '';
    let totalBudget = 0;
    for (const [cat, { limit }] of Object.entries(budgets)) {
      totalBudget += limit;
      const spent = monthly.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
      budgetSummary += `${cat}: $${spent.toFixed(2)} / $${limit}\n`;
    }
    const remainingBudget = totalBudget - totalSpent;

    // Upcoming bills
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7);
    const upcomingBills = bills.filter(b => {
      const due = new Date(b.dueDate);
      return due >= now && due <= nextWeek && b.active;
    });
    const totalBillsDue = upcomingBills.reduce((s, b) => s + b.amount, 0);

    let output = `📊 **Financial Health Report**\n\n`;
    output += `💰 **Month-to-date spending:** $${totalSpent.toFixed(2)}\n`;
    if (totalBudget > 0) {
      output += `📉 **Remaining budget:** $${remainingBudget.toFixed(2)}\n`;
      output += `📈 **Budget breakdown:**\n${budgetSummary}`;
    }
    output += `\n📅 **Upcoming bills (7 days):** ${upcomingBills.length} items, total $${totalBillsDue.toFixed(2)}\n`;
    if (upcomingBills.length > 0) {
      output += upcomingBills.map(b => `  - ${b.name}: $${b.amount.toFixed(2)} (${new Date(b.dueDate).toLocaleDateString()})`).join('\n');
    }

    // Optional budget alert
    if (totalBudget > 0 && totalSpent > totalBudget * 0.9) {
      await notify('Budget Warning', `You've spent ${((totalSpent/totalBudget)*100).toFixed(0)}% of your budget this month.`);
      // Optional WhatsApp: await sendMessage('Your Contact', `⚠️ You've spent ${((totalSpent/totalBudget)*100).toFixed(0)}% of your budget this month.`);
    }

    return { content: [{ type: 'text', text: output }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── 7. Spending forecast ──
export async function forecastSpending(days = 30) {
  try {
    const expenses = await loadExpenses();
    if (expenses.length === 0) {
      return { content: [{ type: 'text', text: '📊 Not enough data to forecast.' }] };
    }

    const now = new Date();
    const past30 = new Date(now);
    past30.setDate(now.getDate() - 30);
    const recent = expenses.filter(e => new Date(e.date) >= past30);
    const avgDaily = recent.reduce((s, e) => s + e.amount, 0) / 30;
    const projection = avgDaily * days;

    return {
      content: [{ type: 'text', text: `📈 **Spending Forecast:**\nIf you continue your current average spending of $${avgDaily.toFixed(2)}/day, you'll spend about $${projection.toFixed(2)} over the next ${days} days.` }]
    };
  } catch (error) {
    return { content: [{ type: 'text', text: `❌ Error: ${error.message}` }], isError: true };
  }
}

// ── 8. Auto-financial check (for cron jobs) ──
export async function autoFinancialCheck() {
  await getBudgetStatus();
  await checkUpcomingBills();
  return { content: [{ type: 'text', text: '✅ Financial check completed.' }] };
}