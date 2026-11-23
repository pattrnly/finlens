export const SYSTEM_CATEGORIES: Array<{
  name: string;
  slug: string;
  kind: string;
  color: string;
  parent?: string;
}> = [
  { name: 'Food & Dining', slug: 'food', kind: 'expense', color: '#f97316' },
  { name: 'Restaurants', slug: 'food-restaurants', kind: 'expense', color: '#f97316', parent: 'food' },
  { name: 'Food delivery', slug: 'food-delivery', kind: 'expense', color: '#f97316', parent: 'food' },
  { name: 'Cafes & tea', slug: 'food-cafe', kind: 'expense', color: '#f97316', parent: 'food' },
  { name: 'Snacks', slug: 'food-snacks', kind: 'expense', color: '#f97316', parent: 'food' },

  { name: 'Groceries', slug: 'groceries', kind: 'expense', color: '#84cc16' },
  { name: 'Supermarket', slug: 'groceries-supermarket', kind: 'expense', color: '#84cc16', parent: 'groceries' },
  { name: 'Vegetables & fruit', slug: 'groceries-produce', kind: 'expense', color: '#84cc16', parent: 'groceries' },
  { name: 'Online grocery', slug: 'groceries-online', kind: 'expense', color: '#84cc16', parent: 'groceries' },
  { name: 'Kirana / dairy', slug: 'groceries-kirana', kind: 'expense', color: '#84cc16', parent: 'groceries' },

  { name: 'Transport', slug: 'transport', kind: 'expense', color: '#06b6d4' },
  { name: 'Petrol / diesel', slug: 'transport-fuel', kind: 'expense', color: '#06b6d4', parent: 'transport' },
  { name: 'Cab & auto', slug: 'transport-cab', kind: 'expense', color: '#06b6d4', parent: 'transport' },
  { name: 'Metro & bus', slug: 'transport-transit', kind: 'expense', color: '#06b6d4', parent: 'transport' },
  { name: 'Parking & tolls', slug: 'transport-tolls', kind: 'expense', color: '#06b6d4', parent: 'transport' },
  { name: 'Vehicle service', slug: 'transport-service', kind: 'expense', color: '#06b6d4', parent: 'transport' },

  { name: 'Shopping', slug: 'shopping', kind: 'expense', color: '#a855f7' },
  { name: 'Online shopping', slug: 'shopping-online', kind: 'expense', color: '#a855f7', parent: 'shopping' },
  { name: 'Clothing', slug: 'shopping-clothing', kind: 'expense', color: '#a855f7', parent: 'shopping' },
  { name: 'Electronics', slug: 'shopping-electronics', kind: 'expense', color: '#a855f7', parent: 'shopping' },
  { name: 'Home & kitchen', slug: 'shopping-home', kind: 'expense', color: '#a855f7', parent: 'shopping' },

  { name: 'Utilities', slug: 'utilities', kind: 'expense', color: '#eab308' },
  { name: 'Electricity', slug: 'utilities-electricity', kind: 'expense', color: '#eab308', parent: 'utilities' },
  { name: 'Mobile & internet', slug: 'utilities-telecom', kind: 'expense', color: '#eab308', parent: 'utilities' },
  { name: 'Gas', slug: 'utilities-gas', kind: 'expense', color: '#eab308', parent: 'utilities' },
  { name: 'Water', slug: 'utilities-water', kind: 'expense', color: '#eab308', parent: 'utilities' },
  { name: 'DTH / broadband', slug: 'utilities-dth', kind: 'expense', color: '#eab308', parent: 'utilities' },

  { name: 'Housing', slug: 'housing', kind: 'expense', color: '#78716c' },
  { name: 'Rent', slug: 'housing-rent', kind: 'expense', color: '#78716c', parent: 'housing' },
  { name: 'Maintenance', slug: 'housing-maintenance', kind: 'expense', color: '#78716c', parent: 'housing' },
  { name: 'Household help', slug: 'housing-household', kind: 'expense', color: '#78716c', parent: 'housing' },

  { name: 'Healthcare', slug: 'healthcare', kind: 'expense', color: '#ef4444' },
  { name: 'Pharmacy', slug: 'healthcare-pharmacy', kind: 'expense', color: '#ef4444', parent: 'healthcare' },
  { name: 'Doctor', slug: 'healthcare-doctor', kind: 'expense', color: '#ef4444', parent: 'healthcare' },
  { name: 'Hospital', slug: 'healthcare-hospital', kind: 'expense', color: '#ef4444', parent: 'healthcare' },

  { name: 'Entertainment', slug: 'entertainment', kind: 'expense', color: '#ec4899' },
  { name: 'OTT & subscriptions', slug: 'entertainment-ott', kind: 'expense', color: '#ec4899', parent: 'entertainment' },
  { name: 'Movies', slug: 'entertainment-movies', kind: 'expense', color: '#ec4899', parent: 'entertainment' },
  { name: 'Games', slug: 'entertainment-games', kind: 'expense', color: '#ec4899', parent: 'entertainment' },

  { name: 'Education', slug: 'education', kind: 'expense', color: '#3b82f6' },
  { name: 'Courses', slug: 'education-courses', kind: 'expense', color: '#3b82f6', parent: 'education' },
  { name: 'School / college', slug: 'education-fees', kind: 'expense', color: '#3b82f6', parent: 'education' },

  { name: 'Travel', slug: 'travel', kind: 'expense', color: '#14b8a6' },
  { name: 'Flights', slug: 'travel-flights', kind: 'expense', color: '#14b8a6', parent: 'travel' },
  { name: 'Trains', slug: 'travel-trains', kind: 'expense', color: '#14b8a6', parent: 'travel' },
  { name: 'Hotels', slug: 'travel-hotels', kind: 'expense', color: '#14b8a6', parent: 'travel' },

  { name: 'Insurance', slug: 'insurance', kind: 'expense', color: '#64748b' },
  { name: 'Health insurance', slug: 'insurance-health', kind: 'expense', color: '#64748b', parent: 'insurance' },
  { name: 'Vehicle insurance', slug: 'insurance-vehicle', kind: 'expense', color: '#64748b', parent: 'insurance' },
  { name: 'Life insurance', slug: 'insurance-life', kind: 'expense', color: '#64748b', parent: 'insurance' },

  { name: 'EMI / Loan', slug: 'emi', kind: 'expense', color: '#b45309' },
  { name: 'Home loan', slug: 'emi-home', kind: 'expense', color: '#b45309', parent: 'emi' },
  { name: 'Vehicle loan', slug: 'emi-vehicle', kind: 'expense', color: '#b45309', parent: 'emi' },
  { name: 'Personal loan', slug: 'emi-personal', kind: 'expense', color: '#b45309', parent: 'emi' },

  { name: 'Loan part payment', slug: 'part-payment', kind: 'system', color: '#0f766e' },

  { name: 'Tax', slug: 'tax', kind: 'expense', color: '#1e293b' },
  { name: 'Income tax', slug: 'tax-income', kind: 'expense', color: '#1e293b', parent: 'tax' },
  { name: 'GST / other tax', slug: 'tax-other', kind: 'expense', color: '#1e293b', parent: 'tax' },

  { name: 'Fees & Charges', slug: 'fees', kind: 'expense', color: '#94a3b8' },
  { name: 'Bank charges', slug: 'fees-bank', kind: 'expense', color: '#94a3b8', parent: 'fees' },
  { name: 'Late fees', slug: 'fees-late', kind: 'expense', color: '#94a3b8', parent: 'fees' },

  { name: 'Personal', slug: 'personal', kind: 'expense', color: '#fb7185' },
  { name: 'Grooming', slug: 'personal-grooming', kind: 'expense', color: '#fb7185', parent: 'personal' },
  { name: 'Fitness', slug: 'personal-fitness', kind: 'expense', color: '#fb7185', parent: 'personal' },
  { name: 'Gifts', slug: 'personal-gifts', kind: 'expense', color: '#fb7185', parent: 'personal' },

  { name: 'Uncategorized', slug: 'uncategorized', kind: 'expense', color: '#52525b' },

  { name: 'Salary', slug: 'salary', kind: 'income', color: '#22c55e' },
  { name: 'Interest', slug: 'interest', kind: 'income', color: '#4ade80' },
  { name: 'Freelance', slug: 'freelance', kind: 'income', color: '#86efac' },
  { name: 'Refunds', slug: 'refunds', kind: 'income', color: '#2dd4bf' },
  { name: 'Other income', slug: 'other-income', kind: 'income', color: '#bbf7d0' },

  { name: 'Mutual Fund', slug: 'mutual-fund', kind: 'investment', color: '#818cf8' },
  { name: 'Stocks', slug: 'stocks', kind: 'investment', color: '#6366f1' },
  { name: 'Fixed Deposit', slug: 'fd', kind: 'investment', color: '#4338ca' },
  { name: 'Gold', slug: 'gold', kind: 'investment', color: '#fbbf24' },
  { name: 'Other investment', slug: 'other-investment', kind: 'investment', color: '#a5b4fc' },

  { name: 'Transfer', slug: 'transfer', kind: 'transfer', color: '#94a3b8' },
];
