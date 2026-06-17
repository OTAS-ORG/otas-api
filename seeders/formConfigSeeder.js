const OnboardingFormConfig = require('../models/OnboardingFormConfig');

const defaultConfigs = [
  {
    serviceType: 'general',
    serviceName: 'General Data (All Clients)',
    sections: [
      {
        title: 'Company Information',
        description: 'Basic company details (pre-populated from CRM)',
        fields: [
          { name: 'companyName', label: 'Company / Brand Name', type: 'text', required: true, placeholder: 'Company name' },
          { name: 'contactPerson', label: 'Primary Contact', type: 'text', required: true, placeholder: 'Name, role, contact info' },
          { name: 'brandLogo', label: 'Brand Logo', type: 'file', required: false, accept: '.png,.jpg,.svg', maxSize: 20 },
        ],
      },
    ],
  },
  {
    serviceType: 'pos',
    serviceName: 'Customize POS Software',
    sections: [
      {
        title: 'Shop & Branch Information',
        fields: [
          { name: 'shopAddresses', label: 'Shop Addresses & Branches', type: 'textarea', required: true, placeholder: 'Enter physical locations and total number of branches' },
          { name: 'branchCount', label: 'Total Number of Branches', type: 'number', required: true, placeholder: 'e.g. 5' },
        ],
      },
      {
        title: 'Inventory',
        fields: [
          { name: 'categoryList', label: 'Category List', type: 'textarea', required: true, placeholder: 'e.g. Beverages, Snacks, Electronics, Groceries' },
          { name: 'inventoryTotal', label: 'Inventory Total', type: 'textarea', required: true, placeholder: 'e.g. ~500 items across 10 categories' },
        ],
      },
      {
        title: 'Voucher Samples',
        fields: [
          { name: 'voucherSamples', label: 'Voucher / Receipt Samples', type: 'file', required: false, accept: '.png,.jpg,.pdf', maxSize: 20 },
        ],
      },
      {
        title: 'Hardware Integration',
        fields: [
          { name: 'hardwareDevices', label: 'Hardware Devices', type: 'checkbox', required: false, options: ['Thermal Printer', 'Barcode Scanner', 'Cash Drawer', 'Customer Display', 'Other'] },
          { name: 'hardwareNotes', label: 'Additional Hardware Notes', type: 'textarea', required: false, placeholder: 'Describe any other hardware requirements' },
        ],
      },
      {
        title: 'Tax & Discount Rules',
        fields: [
          { name: 'taxRules', label: 'Tax & Discount Rules', type: 'textarea', required: false, placeholder: 'Standard tax percentages and discount structures/mechanics' },
        ],
      },
    ],
  },
  {
    serviceType: 'ai_agent',
    serviceName: 'AI Sales & Customer Services Agent',
    sections: [
      {
        title: 'AI Configuration',
        fields: [
          { name: 'primaryAiGoal', label: 'Primary AI Goal', type: 'dropdown', required: true, options: ['Answering FAQs', 'Taking Orders', 'Customer Service', 'Sales', 'Lead Generation', 'Other'] },
          { name: 'deploymentPlatforms', label: 'Deployment Platforms', type: 'checkbox', required: true, options: ['Website', 'Messenger', 'Telegram', 'TikTok', 'Application'] },
        ],
      },
      {
        title: 'Brand Context & Tone',
        fields: [
          { name: 'brandVoice', label: 'Brand Voice', type: 'dropdown', required: true, options: ['Formal', 'Friendly', 'Professional', 'Casual', 'Playful'] },
          { name: 'brandColorHex', label: 'Chat UI Color (Hex Code)', type: 'text', required: false, placeholder: 'e.g. #4F46E5' },
          { name: 'businessHistory', label: 'Brief Business History for AI Context', type: 'textarea', required: false, placeholder: 'Short company background for the AI to reference' },
        ],
      },
      {
        title: 'Product Information',
        fields: [
          { name: 'productBaseCount', label: 'Estimated Total Products', type: 'number', required: true, placeholder: 'e.g. 50' },
        ],
      },
      {
        title: 'Sample Products (Top 5)',
        description: 'Provide detailed profiles for up to 5 key products',
        fields: [
          { name: 'sampleProducts', label: 'Product Profile', type: 'repeater', required: false, fields: [
            { name: 'productName', label: 'Product Name', type: 'text', required: true },
            { name: 'productPrice', label: 'Price', type: 'text', required: true },
            { name: 'productCategory', label: 'Category', type: 'text', required: false },
            { name: 'productDescription', label: 'Description', type: 'textarea', required: true },
            { name: 'productImages', label: 'Product Images', type: 'file', accept: '.png,.jpg', maxSize: 10 },
            { name: 'usageInstructions', label: 'Usage Instructions', type: 'textarea', required: false },
            { name: 'salesScripts', label: 'Sales Scripts / Pitches', type: 'textarea', required: false },
          ]},
        ],
      },
      {
        title: 'CS Protocols & Resolutions',
        fields: [
          { name: 'csProtocols', label: 'Customer Reply Templates', type: 'textarea', required: false, placeholder: 'Existing customer reply templates' },
          { name: 'csResolutionTemplates', label: 'Resolution Templates', type: 'textarea', required: false, placeholder: 'Common complaint types and resolution steps' },
          { name: 'csDocuments', label: 'CS Protocol Documents', type: 'file', accept: '.pdf,.doc,.docx,.xlsx', maxSize: 20 },
        ],
      },
    ],
  },
  {
    serviceType: 'erp',
    serviceName: 'Customize Software & ERP Development',
    sections: [
      {
        title: 'Project Overview',
        fields: [
          { name: 'coreObjective', label: 'Core Objective', type: 'textarea', required: true, placeholder: 'Primary business problem to solve or desired outcome' },
        ],
      },
      {
        title: 'User Management',
        fields: [
          { name: 'userRoles', label: 'User Roles & Permissions', type: 'textarea', required: true, placeholder: 'Expected user tiers and access scopes (e.g. Admin, Manager, Staff)' },
        ],
      },
      {
        title: 'Modules & Features',
        fields: [
          { name: 'keyModules', label: 'Key Modules (ERP)', type: 'checkbox', required: true, options: ['HR', 'Accounting', 'Inventory', 'Sales', 'Procurement', 'Reporting', 'Other'] },
          { name: 'moduleDetails', label: 'Module-Specific Requirements', type: 'textarea', required: false, placeholder: 'Detailed requirements for each selected module' },
        ],
      },
      {
        title: 'Data Migration',
        fields: [
          { name: 'dataMigration', label: 'Data Migration Needs', type: 'dropdown', required: true, options: ['Yes, from previous software', 'Yes, from Excel/CSV', 'No migration needed'] },
          { name: 'migrationDetails', label: 'Migration Details', type: 'textarea', required: false, placeholder: 'Describe what data needs to be migrated and source format' },
        ],
      },
    ],
  },
  {
    serviceType: 'ecommerce',
    serviceName: 'E-commerce Application Development',
    sections: [
      {
        title: 'Product Catalog',
        fields: [
          { name: 'productCategories', label: 'Product Categories', type: 'textarea', required: true, placeholder: 'Primary classifications of goods to be sold' },
        ],
      },
      {
        title: 'Payment Integration',
        fields: [
          { name: 'paymentGateways', label: 'Payment Gateways', type: 'checkbox', required: true, options: ['KBZ Pay', 'KPay', 'AYA Pay', 'CB Pay', 'VISA/Master', 'Other'] },
          { name: 'paymentNotes', label: 'Additional Payment Notes', type: 'textarea', required: false, placeholder: 'Any specific payment requirements' },
        ],
      },
      {
        title: 'Shipping & Logistics',
        fields: [
          { name: 'shippingMethods', label: 'Preferred Delivery Methods', type: 'textarea', required: true, placeholder: 'How shipping rates should be calculated (by township, flat rate, weight-based)' },
          { name: 'shippingProviders', label: 'Shipping Providers', type: 'text', required: false, placeholder: 'e.g. J&T, DHL, Self-delivery' },
        ],
      },
    ],
  },
  {
    serviceType: 'software',
    serviceName: 'Customize Software Development',
    sections: [
      {
        title: 'Project Overview',
        fields: [
          { name: 'coreObjective', label: 'Core Objective', type: 'textarea', required: true, placeholder: 'Primary business problem to solve or desired outcome' },
          { name: 'targetUsers', label: 'Target Users', type: 'textarea', required: true, placeholder: 'Who will use this software and why' },
        ],
      },
      {
        title: 'Features & Requirements',
        fields: [
          { name: 'keyFeatures', label: 'Key Features', type: 'textarea', required: true, placeholder: 'List the main features and functionality required' },
          { name: 'integrations', label: 'Required Integrations', type: 'textarea', required: false, placeholder: 'Third-party APIs or services to integrate with' },
        ],
      },
      {
        title: 'Design & Platform',
        fields: [
          { name: 'platform', label: 'Target Platform', type: 'checkbox', required: true, options: ['Web Application', 'Mobile App (iOS)', 'Mobile App (Android)', 'Desktop App', 'All'] },
          { name: 'designReferences', label: 'Design References', type: 'file', accept: '.png,.jpg,.pdf', maxSize: 20 },
        ],
      },
    ],
  },
];

const seedFormConfigs = async () => {
  try {
    const count = await OnboardingFormConfig.countDocuments();
    if (count === 0) {
      await OnboardingFormConfig.insertMany(defaultConfigs);
      console.log('Default onboarding form configs seeded');
    }
  } catch (err) {
    console.error('Error seeding form configs:', err);
  }
};

module.exports = seedFormConfigs;
