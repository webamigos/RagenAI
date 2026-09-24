/**
 * Nordwind Logistics — English content.
 *
 * A fictional company with fictional people and `.example` addresses. Brain
 * page quotes must occur verbatim in the version they cite — the seed checks
 * this before writing anything and refuses when one does not.
 */
import type { DemoContent } from './types.js';

const leavePolicy = `# Nordwind Logistics Leave Policy 2026

Effective 1 January 2026. Document owner: HR Department. Approved by board resolution 4/2025.

## 1. Annual leave entitlement

Every employee on an employment contract is entitled to 26 days of paid annual leave per calendar year. This also applies to employees with less than 10 years of service — a board decision that goes beyond the statutory minimum. Part-time employees receive a pro-rata entitlement, rounded up to a full day.

## 2. Planning leave

The leave plan for the following year is submitted in the HR system by 15 December. A leave request must be submitted at least 7 working days before the leave starts. Leave longer than 5 working days must be approved by both the line manager and the head of department. At least one block of leave each year should last no less than 14 consecutive calendar days.

## 3. Leave on demand

An employee may take 4 days of leave on demand per year, notifying it no later than 9:00 on the first day of the leave. Notice is given by phone to the line manager and at the same time in the HR system.

## 4. Carrying leave over

Unused leave carries over to the following year and must be taken by 30 September. After that date the HR Department schedules the leave together with the line manager.

## 5. Peak season

Between 15 November and 31 December, leave for warehouse and dispatch staff is limited to 3 working days. Exceptions are approved by the operations manager.

## 6. Contact

Questions about leave go to the HR Department: hr@nordwind-logistics.example.
`;

const hrFaq = `# HR Frequently Asked Questions

Version of March 2023. Prepared by the HR Department for new starters.

## Leave

**How many days of leave do I get?**
Employees are entitled to 20 days of annual leave per year, rising to 26 days after 10 years of service.

**How do I request leave?**
Send a request by email to your line manager at least 3 days before the leave.

## Pay

**When is salary paid?**
Salary is paid by the 10th day of each month.

**Where can I find my payslip?**
Payslips are available in the employee portal from the 1st working day of the month.

## Working time

**Can I work from home?**
Remote work is possible for 1 day per week by agreement with your line manager.

**Who approves overtime?**
Overtime requires prior approval from the shift manager.

## Personal data

**How do I report a change of address?**
Report any change of personal details to the HR Department within 7 days.
`;

const remoteWorkV1 = `# Remote Work Policy

Effective 1 February 2025.

## 1. Scope

This policy applies to office staff: HR, sales, customer support, compliance and finance. Warehouse staff, drivers and dispatchers work on site.

## 2. Remote work allowance

Office staff may work remotely up to 2 days per week. Remote days are agreed with the line manager one week in advance.

## 3. Equipment and security

The company provides a laptop and a headset. Company systems may only be accessed over the VPN. Working on documents containing customers' personal data in public places is prohibited.

## 4. Allowance

Each remote working day entitles the employee to an allowance of EUR 1.50 towards energy and internet costs.

## 5. Availability

Between 9:00 and 15:00 a remote employee remains available on chat and by phone.
`;

const remoteWorkV2 = `# Remote Work Policy

Effective 1 March 2026. Replaces the version of 1 February 2025.

## 1. Scope

This policy applies to office staff: HR, sales, customer support, compliance and finance. Warehouse staff, drivers and dispatchers work on site.

## 2. Remote work allowance

Office staff may work remotely up to 3 days per week. Remote days are agreed with the line manager one week in advance, and every Tuesday the whole team works from the office.

## 3. Equipment and security

The company provides a laptop, a monitor and a headset. Company systems may only be accessed over the VPN. Working on documents containing customers' personal data in public places is prohibited.

## 4. Allowance

Each remote working day entitles the employee to an allowance of EUR 2 towards energy and internet costs.

## 5. Availability

Between 9:00 and 15:00 a remote employee remains available on chat and by phone.
`;

const onboarding = `# New Employee Onboarding Checklist

For line managers and the HR Department. The person responsible ticks off each item.

## Before day one

- HR sends the contract and the medical examination referral no later than 5 working days before the start date.
- IT prepares the laptop, the domain account and VPN access.
- The line manager assigns a buddy for the first 3 months.

## Day one

- The initial health and safety induction is run by the safety officer from 9:00 to 12:00.
- The new employee signs a statement confirming they have read the Code of Conduct.
- The access card is collected at the reception of building A.

## First week

- Data protection (GDPR) training is mandatory and must be completed within 5 working days.
- A meeting with the line manager to agree objectives for the probation period.

## First 90 days

- The end-of-probation review takes place no later than day 80 of employment.
- The buddy gives the line manager short feedback on how the new person is settling in.
`;

const payrollCalendar = `# Payroll Calendar 2026

Sheet: Deadlines

| Month | Timesheet cut-off | Salary payment | Quarterly bonus |
|---|---|---|---|
| January | 26.01.2026 | 30.01.2026 | — |
| February | 23.02.2026 | 27.02.2026 | — |
| March | 25.03.2026 | 31.03.2026 | 31.03.2026 |
| April | 24.04.2026 | 30.04.2026 | — |
| May | 25.05.2026 | 29.05.2026 | — |
| June | 24.06.2026 | 30.06.2026 | 30.06.2026 |
| July | 27.07.2026 | 31.07.2026 | — |
| August | 25.08.2026 | 31.08.2026 | — |
| September | 24.09.2026 | 30.09.2026 | 30.09.2026 |
| October | 26.10.2026 | 30.10.2026 | — |
| November | 23.11.2026 | 30.11.2026 | — |
| December | 18.12.2026 | 23.12.2026 | 23.12.2026 |

Sheet: Notes

Salary is paid on the last working day of the month. In December payment is made before the holidays. Payroll corrections must reach the Payroll team no later than the timesheet cut-off date.
`;

const travelExpense = `# Business Travel and Expense Policy

Version 3.1, effective 1 April 2026. Owner: Operations and Finance.

## 1. Travel approval

Every business trip must be approved by the line manager in the expense system before booking. International trips must also be approved by a board member.

## 2. Transport

Domestic trips of up to 400 km are made by train in standard class or by company car. Domestic flights are permitted only on routes longer than 400 km. Using a private car requires separate approval and is reimbursed at the mileage rate.

## 3. Accommodation

The hotel limit is EUR 140 per night in capital cities and EUR 110 per night elsewhere. Bookings are made through the company travel agency.

## 4. Per diem

The domestic per diem is EUR 15 per day of travel. If the organiser provides meals, the per diem is reduced accordingly.

## 5. Settlement

Expenses are settled within 14 days of the end of the trip, with scanned invoices attached. Invoices must be issued to Nordwind Logistics Ltd.

## 6. Company card

The company card may not be used for private expenses, even if repaid later. A lost card must be reported to Finance immediately.
`;

const priceList = `# Price List 2026

Sheet: Base prices (net, EUR)

| Service | Unit | Price |
|---|---|---|
| Domestic FTL transport | km | 1.25 |
| Domestic LTL transport | pallet | 43.00 |
| Warehousing | pallet / month | 9.00 |
| Order picking | order line | 0.45 |
| Cross-docking | pallet | 5.80 |
| Refrigerated transport (2–8°C) | km | 1.55 |
| ADR surcharge | order | 60.00 |

Sheet: Volume discounts

| Monthly volume | Discount |
|---|---|
| over 100 pallets | 5% |
| over 500 pallets | 8% |
| over 1000 pallets | 12% |

Sheet: Notes

Prices exclude the fuel surcharge, which is updated monthly. Discounts above 12% require approval from the sales director.
`;

const quotingRules = `# Quoting and Discount Rules

Internal Sales document. Last updated: July 2026.

## Quote workflow

1. The account manager qualifies the enquiry in the CRM within 24 hours of receipt.
2. A standard quote is based on the current price list.
3. A quote is valid for 30 days from the date it is sent.

## Discounts

- An account manager may grant a discount of up to 5% on their own.
- A discount between 5% and 12% is approved by the sales manager.
- A discount above 12% requires approval from the sales director and a margin analysis.

## Framework agreements

Framework agreements are signed for a minimum of 12 months, and prices are indexed once a year against the official inflation index.

## Payment terms

The standard payment term is 30 days. A 60-day term requires a positive credit risk assessment.
`;

const returns = `# Returns and Claims – Nordwind Logistics

Page: nordwind-logistics.example/en/returns-and-claims

## How to file a claim

A claim for a damaged shipment must be filed within 7 days of delivery. Damage visible on delivery is recorded by the driver in a damage report in the presence of the recipient. The claim must include photos of the packaging and the goods and the consignment note number.

## Processing time

Claims are processed within 14 working days. We inform the claimant of the outcome by email.

## Liability

In international transport the carrier's liability is limited under the CMR Convention to 8.33 SDR per kilogram of gross weight. Higher protection is available by declaring the value of the shipment in the order.

## Returns to sender

Returns to the sender are carried out within 5 working days of the order.

## Contact

claims@nordwind-logistics.example
`;

const sla = `# Service Level Agreement (SLA) 2026

Annex 2 to framework agreements signed from 1 January 2026.

## 1. On-time delivery

We guarantee on-time delivery of 98.5% per month for domestic transport.

## 2. Customer service response times

Critical tickets (e.g. deliveries stopped) – response within 1 hour, 24/7. High-priority tickets – response within 4 business hours. Standard tickets – response within 1 business day.

## 3. Service credits

For each full percentage point below the guaranteed on-time rate the customer receives a 2% reduction of the monthly fee, up to a maximum of 10%.

## 4. Tracking portal availability

The shipment tracking portal is available 99.5% of the time each month, excluding announced maintenance.

## 5. Reporting

The SLA report is sent to the customer by the 5th business day of the following month.
`;

const escalation = `# Support Escalation Matrix

Sheet: Escalations

| Priority | Example | First line | Escalate after | Escalate to |
|---|---|---|---|---|
| P1 – critical | deliveries stopped, accident involving cargo | Duty dispatcher | 30 minutes | Operations manager, then COO |
| P2 – high | delay over 24 h, damaged batch | Support agent | 4 hours | Support team lead |
| P3 – standard | invoice question, address change | Support agent | 2 business days | Support team lead |
| Claim above EUR 5,000 | total loss | Support agent | immediately | Compliance and the customer's account manager |

Sheet: Notes

Every P1 incident requires a post-incident report within 48 hours. The dispatch duty number is staffed around the clock.
`;

const gdpr = `# Personal Data Processing Procedure (GDPR)

Version 2.0. Owner: Compliance Officer.

## 1. Purpose

This procedure sets out how Nordwind Logistics processes the personal data of customers, shipment recipients and employees.

## 2. Legal basis

Shipment recipients' data is processed on the basis of legitimate interest in order to complete the delivery.

## 3. Data processing agreements

Every subcontractor processing data on our behalf must sign a data processing agreement before work begins. The register of processing agreements is kept by the Compliance team.

## 4. Retention periods

Shipment recipients' data is kept for 12 months from delivery, and transport documentation for 5 years for tax purposes.

## 5. Breaches

Any suspected personal data breach must be reported to the Data Protection Officer within 24 hours. The Data Protection Officer assesses the risk and, where required, notifies the supervisory authority within 72 hours of becoming aware of the breach.

## 6. Data subject rights

Requests from data subjects are handled within one month. Contact the Data Protection Officer at dpo@nordwind-logistics.example.
`;

const fleetSafety = `# Fleet Safety Procedure

Version 4, binding on all drivers and dispatchers.

## 1. Pre-departure check

The driver carries out a daily vehicle check before the first run and records it in the fleet app. The check covers tyres, lights, fluids, load securing and the tachograph.

## 2. Driving time

Daily driving time may not exceed 9 hours, and a 45-minute break is required after 4.5 hours of driving.

## 3. Load securing

Loads are secured with straps in accordance with EN 12195-1, and the driver confirms this with a photo in the app.

## 4. Accidents and collisions

In the event of an accident the driver secures the scene, calls the emergency services and informs the duty dispatcher within 15 minutes.

## 5. Training

Every driver completes defensive driving training once every 24 months.

## 6. Phones

Phones may only be used while driving through a hands-free kit.
`;

const codeOfConduct = `# Code of Conduct and Anti-Bribery Policy

## Gifts

Employees may not accept gifts from customers or suppliers worth more than EUR 50. Any gift worth more than EUR 25 must be recorded in the gift register.

## Conflicts of interest

A conflict of interest is reported to the Compliance Officer before the decision it concerns is taken.

## Speaking up

Concerns can be raised anonymously through the whistleblowing channel, and the reporter receives an acknowledgement within 7 days.

## Sanctions screening

Every new counterparty is screened against EU sanctions lists before a contract is signed.
`;

const adrDraft = `# Dangerous Goods (ADR) Transport Instructions — draft

Draft for consultation, working version of September 2026.

## Transport documents

Every dangerous goods consignment requires an ADR transport document and written instructions for the driver in a language the driver understands.

## Vehicle equipment

A vehicle carrying dangerous goods must carry two fire extinguishers, wheel chocks and a spill kit.

## DGSA adviser

The company appoints a dangerous goods safety adviser, who prepares an annual report by 28 February.
`;

export const contentEn: DemoContent = {
  orgName: 'Nordwind Logistics Ltd',
  generalTeam: 'General',
  defaultAssistantTitle: 'Main assistant',
  people: {
    anna: {
      name: 'Anna Walker',
      emailLocal: 'anna.walker',
      title: 'Chief Executive Officer',
    },
    tomasz: {
      name: 'Thomas Newman',
      emailLocal: 'thomas.newman',
      title: 'Chief Operating Officer',
    },
    magdalena: {
      name: 'Megan Wilson',
      emailLocal: 'megan.wilson',
      title: 'HR Director',
    },
    piotr: {
      name: 'Peter Hughes',
      emailLocal: 'peter.hughes',
      title: 'Sales Manager',
    },
    katarzyna: {
      name: 'Kate Lewis',
      emailLocal: 'kate.lewis',
      title: 'Customer Support Lead',
    },
    michal: {
      name: 'Michael Wood',
      emailLocal: 'michael.wood',
      title: 'Compliance Officer',
    },
    joanna: {
      name: 'Joanna King',
      emailLocal: 'joanna.king',
      title: 'HR and Payroll Specialist',
    },
    pawel: {
      name: 'Paul Davies',
      emailLocal: 'paul.davies',
      title: 'Health, Safety and Fleet Specialist',
    },
    robert: {
      name: 'Robert Mills',
      emailLocal: 'robert.mills',
      title: 'Former Key Account Manager',
    },
  },
  teams: {
    hr: 'HR',
    sales: 'Sales',
    support: 'Customer Support',
    compliance: 'Compliance',
  },
  folders: {
    hr: 'HR',
    payroll: 'Payroll',
    sales: 'Sales',
    support: 'Support',
    compliance: 'Compliance',
    operations: 'Operations',
  },
  documents: {
    'leave-policy': {
      fileName: 'Leave_Policy_2026.pdf',
      title: 'Leave Policy 2026',
      versions: [leavePolicy],
    },
    'hr-faq': {
      fileName: 'HR_FAQ_2023.docx',
      title: 'HR Frequently Asked Questions (2023)',
      versions: [hrFaq],
    },
    'remote-work': {
      fileName: 'Remote_Work_Policy.pdf',
      title: 'Remote Work Policy',
      versions: [remoteWorkV1, remoteWorkV2],
      versionComments: [
        'New allowance: up to 3 days a week, EUR 2 per day, Tuesdays in the office.',
      ],
    },
    onboarding: {
      fileName: 'Onboarding_Checklist.docx',
      title: 'Onboarding Checklist',
      versions: [onboarding],
    },
    'payroll-calendar': {
      fileName: 'Payroll_Calendar_2026.xlsx',
      title: 'Payroll Calendar 2026',
      versions: [payrollCalendar],
    },
    'travel-expense': {
      fileName: 'Travel_and_Expense_Policy.pdf',
      title: 'Business Travel and Expense Policy',
      versions: [travelExpense],
    },
    'price-list': {
      fileName: 'Price_List_2026.xlsx',
      title: 'Price List 2026',
      versions: [priceList],
    },
    'quoting-rules': {
      fileName: 'Quoting_and_Discount_Rules.md',
      title: 'Quoting and Discount Rules',
      versions: [quotingRules],
    },
    returns: {
      fileName: 'https://nordwind-logistics.example/en/returns-and-claims',
      title: 'Returns and Claims',
      versions: [returns],
    },
    sla: {
      fileName: 'SLA_Terms_2026.pdf',
      title: 'SLA Terms 2026',
      versions: [sla],
    },
    escalation: {
      fileName: 'Support_Escalation_Matrix.xlsx',
      title: 'Support Escalation Matrix',
      versions: [escalation],
    },
    gdpr: {
      fileName: 'GDPR_Data_Processing_Procedure.docx',
      title: 'Personal Data Processing Procedure (GDPR)',
      versions: [gdpr],
    },
    'fleet-safety': {
      fileName: 'Fleet_Safety_Procedure.pdf',
      title: 'Fleet Safety Procedure',
      versions: [fleetSafety],
    },
    'code-of-conduct': {
      fileName: 'Code_of_Conduct_and_Anti-Bribery.md',
      title: 'Code of Conduct and Anti-Bribery Policy',
      versions: [codeOfConduct],
    },
    'adr-draft': {
      fileName: 'ADR_Dangerous_Goods_Draft.docx',
      title: 'Dangerous Goods (ADR) Transport Instructions (draft)',
      versions: [adrDraft],
    },
  },
  assistants: {
    hr: {
      title: 'HR Assistant',
      instructions:
        "You are the Nordwind Logistics HR assistant. You answer employees' questions about leave, remote work, onboarding, business travel and pay, using only the documents in the knowledge base. Always cite your source. When documents contradict each other, point to the newer one and flag the discrepancy. Never disclose any individual's pay.",
    },
    sales: {
      title: 'Sales Assistant',
      instructions:
        "You help Nordwind Logistics account managers prepare quotes: prices from the current price list, discount thresholds, payment terms and SLA. Quote net prices in EUR and always mention the fuel surcharge. Flag any discount above the account manager's authority as needing approval.",
    },
    support: {
      title: 'Customer Support Assistant',
      instructions:
        'You support customer service agents. You answer questions about claims, returns, SLA and escalations. Keep answers short and in bullet points so the agent can pass them straight to the customer. For P1 tickets always remind the agent of the escalation path.',
    },
    compliance: {
      title: 'Compliance Assistant',
      instructions:
        'You answer questions about GDPR, data processing agreements, retention periods, the code of conduct and sanctions screening. Quote exact deadlines from the procedures. If the question concerns a specific incident, advise contacting the Data Protection Officer.',
    },
  },
  pages: {
    'annual-leave': {
      key: 'annual-leave',
      title: 'Annual leave',
      summary:
        'How much annual leave Nordwind employees get and when carried-over leave must be taken.',
      claims: [
        {
          text: 'Every employee on an employment contract gets 26 days of leave a year, regardless of length of service.',
          source: {
            doc: 'leave-policy',
            quote:
              'Every employee on an employment contract is entitled to 26 days of paid annual leave per calendar year.',
          },
        },
        {
          text: 'Carried-over leave must be taken by 30 September of the following year.',
          source: {
            doc: 'leave-policy',
            quote:
              'Unused leave carries over to the following year and must be taken by 30 September.',
          },
        },
      ],
    },
    'leave-faq': {
      key: 'leave-faq',
      title: 'Leave entitlement according to the HR FAQ',
      summary:
        'The leave entitlement described in the older FAQ for new starters.',
      claims: [
        {
          text: 'Employees get 20 days of leave a year, rising to 26 after 10 years of service.',
          source: {
            doc: 'hr-faq',
            quote:
              'Employees are entitled to 20 days of annual leave per year, rising to 26 days after 10 years of service.',
          },
        },
      ],
    },
    'leave-request': {
      key: 'leave-request',
      title: 'Submitting a leave request',
      summary: 'How and how far in advance to request leave.',
      claims: [
        {
          text: 'A request is submitted at least 7 working days before the leave.',
          source: {
            doc: 'leave-policy',
            quote:
              'A leave request must be submitted at least 7 working days before the leave starts.',
          },
        },
        {
          text: 'Leave longer than 5 working days is approved by the line manager and the head of department.',
          source: {
            doc: 'leave-policy',
            quote:
              'Leave longer than 5 working days must be approved by both the line manager and the head of department.',
          },
        },
      ],
    },
    'leave-request-faq': {
      key: 'leave-request-faq',
      title: 'Requesting leave by email',
      summary: 'How leave is requested according to the 2023 HR FAQ.',
      claims: [
        {
          text: 'The request goes by email to the line manager at least 3 days before the leave.',
          source: {
            doc: 'hr-faq',
            quote:
              'Send a request by email to your line manager at least 3 days before the leave.',
          },
        },
      ],
    },
    'on-demand-leave': {
      key: 'on-demand-leave',
      title: 'Leave on demand',
      summary: 'Rules for the four days of leave on demand.',
      claims: [
        {
          text: 'Four days a year, notified by 9:00 on the day.',
          source: {
            doc: 'leave-policy',
            quote:
              'An employee may take 4 days of leave on demand per year, notifying it no later than 9:00 on the first day of the leave.',
          },
        },
        {
          text: 'Notice goes by phone to the manager and into the HR system.',
          source: {
            doc: 'leave-policy',
            quote:
              'Notice is given by phone to the line manager and at the same time in the HR system.',
          },
        },
      ],
    },
    'peak-season-leave': {
      key: 'peak-season-leave',
      title: 'Leave during peak season',
      summary:
        'Leave limits for warehouse and dispatch staff before the holidays.',
      claims: [
        {
          text: 'From 15 November to 31 December warehouse and dispatch staff take at most 3 days of leave.',
          source: {
            doc: 'leave-policy',
            quote:
              'Between 15 November and 31 December, leave for warehouse and dispatch staff is limited to 3 working days.',
          },
        },
        {
          text: 'Exceptions are approved by the operations manager.',
          source: {
            doc: 'leave-policy',
            quote: 'Exceptions are approved by the operations manager.',
          },
        },
      ],
    },
    'remote-work': {
      key: 'remote-work',
      title: 'Remote work',
      summary: 'Who may work remotely, and how much.',
      claims: [
        {
          text: 'Office staff may work remotely up to 2 days a week.',
          source: {
            doc: 'remote-work',
            version: 1,
            quote: 'Office staff may work remotely up to 2 days per week.',
          },
        },
        {
          text: 'Company systems are accessed only over the VPN.',
          source: {
            doc: 'remote-work',
            version: 1,
            quote: 'Company systems may only be accessed over the VPN.',
          },
        },
      ],
    },
    'remote-allowance': {
      key: 'remote-allowance',
      title: 'Remote work allowance',
      summary: 'The contribution to energy and internet costs per remote day.',
      claims: [
        {
          text: 'Each remote day earns an allowance of EUR 2.',
          source: {
            doc: 'remote-work',
            quote:
              'Each remote working day entitles the employee to an allowance of EUR 2 towards energy and internet costs.',
          },
        },
      ],
    },
    'hr-department': {
      key: 'hr-department',
      title: 'HR Department',
      summary:
        'The team responsible for leave, onboarding and personnel records.',
      claims: [
        {
          text: 'Questions about leave go to the HR Department.',
          source: {
            doc: 'leave-policy',
            quote:
              'Questions about leave go to the HR Department: hr@nordwind-logistics.example.',
          },
        },
        {
          text: 'Changes of personal details are reported to HR within 7 days.',
          source: {
            doc: 'hr-faq',
            quote:
              'Report any change of personal details to the HR Department within 7 days.',
          },
        },
      ],
    },
    payday: {
      key: 'payday',
      title: 'Salary payment date',
      summary: 'By which day of the month salary is paid.',
      claims: [
        {
          text: 'Salary is paid by the 10th of the month.',
          source: {
            doc: 'hr-faq',
            quote: 'Salary is paid by the 10th day of each month.',
          },
        },
      ],
    },
    onboarding: {
      key: 'onboarding',
      title: 'New employee onboarding',
      summary: 'The steps from signing the contract to the end of probation.',
      claims: [
        {
          text: 'HR sends the contract and medical referral 5 working days before the start date.',
          source: {
            doc: 'onboarding',
            quote:
              'HR sends the contract and the medical examination referral no later than 5 working days before the start date.',
          },
        },
        {
          text: 'The line manager assigns a buddy for the first 3 months.',
          source: {
            doc: 'onboarding',
            quote: 'The line manager assigns a buddy for the first 3 months.',
          },
        },
        {
          text: 'Probation is reviewed no later than day 80.',
          source: {
            doc: 'onboarding',
            quote:
              'The end-of-probation review takes place no later than day 80 of employment.',
          },
        },
      ],
    },
    buddy: {
      key: 'buddy',
      title: 'Onboarding buddy',
      summary: 'The role of the person who introduces a new employee.',
      claims: [
        {
          text: 'The line manager assigns a buddy for the first 3 months.',
          source: {
            doc: 'onboarding',
            quote: 'The line manager assigns a buddy for the first 3 months.',
          },
        },
        {
          text: 'The buddy gives the manager feedback on onboarding.',
          source: {
            doc: 'onboarding',
            quote:
              'The buddy gives the line manager short feedback on how the new person is settling in.',
          },
        },
      ],
    },
    'safety-induction': {
      key: 'safety-induction',
      title: 'Health and safety induction',
      summary: 'The mandatory induction on day one.',
      claims: [
        {
          text: 'The induction runs on day one from 9:00 to 12:00.',
          source: {
            doc: 'onboarding',
            quote:
              'The initial health and safety induction is run by the safety officer from 9:00 to 12:00.',
          },
        },
      ],
    },
    'gdpr-training': {
      key: 'gdpr-training',
      title: 'GDPR training for new starters',
      summary: 'Mandatory data protection training in the first week.',
      claims: [
        {
          text: 'The training must be completed within 5 working days.',
          source: {
            doc: 'onboarding',
            quote:
              'Data protection (GDPR) training is mandatory and must be completed within 5 working days.',
          },
        },
      ],
    },
    'it-access': {
      key: 'it-access',
      title: 'IT access for new starters',
      summary: 'Equipment and accounts prepared before day one.',
      claims: [
        {
          text: 'IT prepares the laptop, domain account and VPN before the start date.',
          source: {
            doc: 'onboarding',
            quote: 'IT prepares the laptop, the domain account and VPN access.',
          },
        },
      ],
    },
    'probation-review': {
      key: 'probation-review',
      title: 'End-of-probation review',
      summary: 'The meeting that closes the probation period.',
      claims: [
        {
          text: 'The review takes place no later than day 80.',
          source: {
            doc: 'onboarding',
            quote:
              'The end-of-probation review takes place no later than day 80 of employment.',
          },
        },
      ],
    },
    'discount-approval': {
      key: 'discount-approval',
      title: 'Discount approval',
      summary: 'Who may approve which discount on a quote.',
      claims: [
        {
          text: 'An account manager may grant up to 5% alone.',
          source: {
            doc: 'quoting-rules',
            quote:
              'An account manager may grant a discount of up to 5% on their own.',
          },
        },
        {
          text: 'The sales manager approves 5% to 12%.',
          source: {
            doc: 'quoting-rules',
            quote:
              'A discount between 5% and 12% is approved by the sales manager.',
          },
        },
        {
          text: 'Above 12% needs the sales director and a margin analysis.',
          source: {
            doc: 'quoting-rules',
            quote:
              'A discount above 12% requires approval from the sales director and a margin analysis.',
          },
        },
      ],
    },
    'quote-validity': {
      key: 'quote-validity',
      title: 'Quote validity',
      summary: 'How long a quote remains valid.',
      claims: [
        {
          text: 'A quote is valid for 30 days from sending.',
          source: {
            doc: 'quoting-rules',
            quote: 'A quote is valid for 30 days from the date it is sent.',
          },
        },
      ],
    },
    'frame-agreement': {
      key: 'frame-agreement',
      title: 'Framework agreement',
      summary: 'Minimum term and price indexation in framework agreements.',
      claims: [
        {
          text: 'Framework agreements run for at least 12 months with yearly indexation.',
          source: {
            doc: 'quoting-rules',
            quote:
              'Framework agreements are signed for a minimum of 12 months, and prices are indexed once a year against the official inflation index.',
          },
        },
      ],
    },
    'payment-terms': {
      key: 'payment-terms',
      title: 'Customer payment terms',
      summary: 'The standard and extended payment terms.',
      claims: [
        {
          text: '30 days as standard.',
          source: {
            doc: 'quoting-rules',
            quote: 'The standard payment term is 30 days.',
          },
        },
        {
          text: '60 days requires a credit risk assessment.',
          source: {
            doc: 'quoting-rules',
            quote: 'A 60-day term requires a positive credit risk assessment.',
          },
        },
      ],
    },
    ftl: {
      key: 'ftl',
      title: 'Domestic FTL transport',
      summary: 'Full-truckload domestic transport.',
      claims: [
        {
          text: 'The price is EUR 1.25 net per kilometre.',
          source: {
            doc: 'price-list',
            quote: 'Domestic FTL transport | km | 1.25',
          },
        },
        {
          text: 'Prices exclude the fuel surcharge.',
          source: {
            doc: 'price-list',
            quote:
              'Prices exclude the fuel surcharge, which is updated monthly.',
          },
        },
      ],
    },
    'cold-chain': {
      key: 'cold-chain',
      title: 'Refrigerated transport 2–8°C',
      summary: 'Temperature-controlled transport.',
      claims: [
        {
          text: 'The price is EUR 1.55 net per kilometre.',
          source: {
            doc: 'price-list',
            quote: 'Refrigerated transport (2–8°C) | km | 1.55',
          },
        },
      ],
    },
    warehousing: {
      key: 'warehousing',
      title: 'Warehousing and order picking',
      summary: 'Warehouse services from the 2026 price list.',
      claims: [
        {
          text: 'Warehousing costs EUR 9 per pallet per month.',
          source: {
            doc: 'price-list',
            quote: 'Warehousing | pallet / month | 9.00',
          },
        },
        {
          text: 'Order picking costs EUR 0.45 per order line.',
          source: {
            doc: 'price-list',
            quote: 'Order picking | order line | 0.45',
          },
        },
      ],
    },
    'volume-discounts': {
      key: 'volume-discounts',
      title: 'Volume discounts',
      summary: 'Discount thresholds based on monthly pallet volume.',
      claims: [
        {
          text: 'Over 1000 pallets a month the discount is 12%.',
          source: { doc: 'price-list', quote: 'over 1000 pallets | 12%' },
        },
        {
          text: 'Higher discounts are approved by the sales director.',
          source: {
            doc: 'price-list',
            quote:
              'Discounts above 12% require approval from the sales director.',
          },
        },
      ],
    },
    'lead-qualification': {
      key: 'lead-qualification',
      title: 'Qualifying an enquiry',
      summary: 'The first step of the quote workflow in the CRM.',
      claims: [
        {
          text: 'An enquiry is qualified in the CRM within 24 hours.',
          source: {
            doc: 'quoting-rules',
            quote:
              'The account manager qualifies the enquiry in the CRM within 24 hours of receipt.',
          },
        },
      ],
    },
    claims: {
      key: 'claims',
      title: 'Damaged shipment claims',
      summary: 'How a customer reports damage and how long processing takes.',
      claims: [
        {
          text: 'A claim is filed within 7 days of delivery.',
          source: {
            doc: 'returns',
            quote:
              'A claim for a damaged shipment must be filed within 7 days of delivery.',
          },
        },
        {
          text: 'Photos and the consignment note number are required.',
          source: {
            doc: 'returns',
            quote:
              'The claim must include photos of the packaging and the goods and the consignment note number.',
          },
        },
        {
          text: 'Processing takes up to 14 working days.',
          source: {
            doc: 'returns',
            quote: 'Claims are processed within 14 working days.',
          },
        },
      ],
    },
    'damage-report': {
      key: 'damage-report',
      title: 'Damage report',
      summary: 'The document drawn up when a damaged shipment is received.',
      claims: [
        {
          text: 'The driver records visible damage in the presence of the recipient.',
          source: {
            doc: 'returns',
            quote:
              'Damage visible on delivery is recorded by the driver in a damage report in the presence of the recipient.',
          },
        },
      ],
    },
    'cmr-liability': {
      key: 'cmr-liability',
      title: 'Carrier liability (CMR)',
      summary: 'The liability limit in international transport.',
      claims: [
        {
          text: 'Liability is limited to 8.33 SDR per kilogram.',
          source: {
            doc: 'returns',
            quote:
              "In international transport the carrier's liability is limited under the CMR Convention to 8.33 SDR per kilogram of gross weight.",
          },
        },
      ],
    },
    'on-time-delivery': {
      key: 'on-time-delivery',
      title: 'Guaranteed on-time delivery',
      summary: 'The on-time rate in the SLA and the credits for missing it.',
      claims: [
        {
          text: 'Guaranteed on-time delivery is 98.5% per month.',
          source: {
            doc: 'sla',
            quote:
              'We guarantee on-time delivery of 98.5% per month for domestic transport.',
          },
        },
        {
          text: 'Each point below earns a 2% credit, up to 10%.',
          source: {
            doc: 'sla',
            quote:
              'For each full percentage point below the guaranteed on-time rate the customer receives a 2% reduction of the monthly fee, up to a maximum of 10%.',
          },
        },
      ],
    },
    'response-times': {
      key: 'response-times',
      title: 'Ticket response times',
      summary: 'How quickly support responds by priority.',
      claims: [
        {
          text: 'Critical tickets: within one hour, around the clock.',
          source: {
            doc: 'sla',
            quote:
              'Critical tickets (e.g. deliveries stopped) – response within 1 hour, 24/7.',
          },
        },
        {
          text: 'Standard tickets: within one business day.',
          source: {
            doc: 'sla',
            quote: 'Standard tickets – response within 1 business day.',
          },
        },
      ],
    },
    'p1-escalation': {
      key: 'p1-escalation',
      title: 'P1 escalation',
      summary: 'The escalation path for critical incidents.',
      claims: [
        {
          text: 'P1 goes to the duty dispatcher and escalates after 30 minutes.',
          source: {
            doc: 'escalation',
            quote:
              'P1 – critical | deliveries stopped, accident involving cargo | Duty dispatcher | 30 minutes',
          },
        },
        {
          text: 'A report follows every P1 within 48 hours.',
          source: {
            doc: 'escalation',
            quote:
              'Every P1 incident requires a post-incident report within 48 hours.',
          },
        },
      ],
    },
    dispatcher: {
      key: 'dispatcher',
      title: 'Duty dispatcher',
      summary: 'First line for critical incidents and accidents.',
      claims: [
        {
          text: 'The driver informs the duty dispatcher of an accident within 15 minutes.',
          source: {
            doc: 'fleet-safety',
            quote:
              'In the event of an accident the driver secures the scene, calls the emergency services and informs the duty dispatcher within 15 minutes.',
          },
        },
        {
          text: 'The duty number is staffed around the clock.',
          source: {
            doc: 'escalation',
            quote: 'The dispatch duty number is staffed around the clock.',
          },
        },
      ],
    },
    'tracking-portal': {
      key: 'tracking-portal',
      title: 'Shipment tracking portal',
      summary: 'Availability of the portal customers use to track shipments.',
      claims: [
        {
          text: 'The portal is available 99.5% of the time each month.',
          source: {
            doc: 'sla',
            quote:
              'The shipment tracking portal is available 99.5% of the time each month, excluding announced maintenance.',
          },
        },
      ],
    },
    'data-breach': {
      key: 'data-breach',
      title: 'Reporting a data breach',
      summary:
        'Deadlines for reporting a breach to the DPO and to the regulator.',
      claims: [
        {
          text: 'A suspected breach is reported to the DPO within 24 hours.',
          source: {
            doc: 'gdpr',
            quote:
              'Any suspected personal data breach must be reported to the Data Protection Officer within 24 hours.',
          },
        },
        {
          text: 'The DPO notifies the regulator within 72 hours where required.',
          source: {
            doc: 'gdpr',
            quote:
              'The Data Protection Officer assesses the risk and, where required, notifies the supervisory authority within 72 hours of becoming aware of the breach.',
          },
        },
      ],
    },
    retention: {
      key: 'retention',
      title: 'Data retention periods',
      summary: 'How long recipient data and documentation are kept.',
      claims: [
        {
          text: 'Recipient data 12 months, transport documents 5 years.',
          source: {
            doc: 'gdpr',
            quote:
              "Shipment recipients' data is kept for 12 months from delivery, and transport documentation for 5 years for tax purposes.",
          },
        },
      ],
    },
    dpa: {
      key: 'dpa',
      title: 'Data processing agreement',
      summary:
        'A precondition for working with any subcontractor that processes data.',
      claims: [
        {
          text: 'Subcontractors sign a processing agreement before work begins.',
          source: {
            doc: 'gdpr',
            quote:
              'Every subcontractor processing data on our behalf must sign a data processing agreement before work begins.',
          },
        },
        {
          text: 'The register is kept by Compliance.',
          source: {
            doc: 'gdpr',
            quote:
              'The register of processing agreements is kept by the Compliance team.',
          },
        },
      ],
    },
    dpo: {
      key: 'dpo',
      title: 'Data Protection Officer',
      summary: 'The contact person for personal data matters.',
      claims: [
        {
          text: 'Contact the DPO at dpo@nordwind-logistics.example.',
          source: {
            doc: 'gdpr',
            quote:
              'Contact the Data Protection Officer at dpo@nordwind-logistics.example.',
          },
        },
      ],
    },
    gifts: {
      key: 'gifts',
      title: 'Accepting gifts',
      summary: 'Value limits for gifts from customers and suppliers.',
      claims: [
        {
          text: 'No gifts worth more than EUR 50.',
          source: {
            doc: 'code-of-conduct',
            quote:
              'Employees may not accept gifts from customers or suppliers worth more than EUR 50.',
          },
        },
        {
          text: 'Gifts over EUR 25 go in the register.',
          source: {
            doc: 'code-of-conduct',
            quote:
              'Any gift worth more than EUR 25 must be recorded in the gift register.',
          },
        },
      ],
    },
    sanctions: {
      key: 'sanctions',
      title: 'Sanctions screening of counterparties',
      summary: 'Screening new counterparties before a contract is signed.',
      claims: [
        {
          text: 'Every new counterparty is screened against EU sanctions lists.',
          source: {
            doc: 'code-of-conduct',
            quote:
              'Every new counterparty is screened against EU sanctions lists before a contract is signed.',
          },
        },
      ],
    },
    whistleblowing: {
      key: 'whistleblowing',
      title: 'Whistleblowing channel',
      summary: 'Raising concerns anonymously.',
      claims: [
        {
          text: 'Concerns can be raised anonymously; acknowledgement follows within 7 days.',
          source: {
            doc: 'code-of-conduct',
            quote:
              'Concerns can be raised anonymously through the whistleblowing channel, and the reporter receives an acknowledgement within 7 days.',
          },
        },
      ],
    },
    'vehicle-check': {
      key: 'vehicle-check',
      title: 'Daily vehicle check',
      summary: 'The check a driver performs before the first run.',
      claims: [
        {
          text: 'The check is recorded in the fleet app before the first run.',
          source: {
            doc: 'fleet-safety',
            quote:
              'The driver carries out a daily vehicle check before the first run and records it in the fleet app.',
          },
        },
        {
          text: 'It covers tyres, lights, fluids, load and tachograph.',
          source: {
            doc: 'fleet-safety',
            quote:
              'The check covers tyres, lights, fluids, load securing and the tachograph.',
          },
        },
      ],
    },
    'driving-time': {
      key: 'driving-time',
      title: 'Driver working time',
      summary: 'Driving limits and mandatory breaks.',
      claims: [
        {
          text: 'At most 9 hours of driving a day, with a 45-minute break after 4.5 hours.',
          source: {
            doc: 'fleet-safety',
            quote:
              'Daily driving time may not exceed 9 hours, and a 45-minute break is required after 4.5 hours of driving.',
          },
        },
      ],
    },
    'load-securing': {
      key: 'load-securing',
      title: 'Load securing',
      summary: 'The standard for securing loads and how it is confirmed.',
      claims: [
        {
          text: 'Loads are strapped per EN 12195-1 and confirmed with a photo.',
          source: {
            doc: 'fleet-safety',
            quote:
              'Loads are secured with straps in accordance with EN 12195-1, and the driver confirms this with a photo in the app.',
          },
        },
      ],
    },
    accident: {
      key: 'accident',
      title: 'What to do after an accident',
      summary: 'What a driver does after an accident or collision.',
      claims: [
        {
          text: 'Secure the scene, call emergency services, tell the dispatcher within 15 minutes.',
          source: {
            doc: 'fleet-safety',
            quote:
              'In the event of an accident the driver secures the scene, calls the emergency services and informs the duty dispatcher within 15 minutes.',
          },
        },
      ],
    },
    'travel-approval': {
      key: 'travel-approval',
      title: 'Business travel approval',
      summary: 'Approving a trip before booking.',
      claims: [
        {
          text: 'The line manager approves the trip in the expense system before booking.',
          source: {
            doc: 'travel-expense',
            quote:
              'Every business trip must be approved by the line manager in the expense system before booking.',
          },
        },
        {
          text: 'International trips also need a board member.',
          source: {
            doc: 'travel-expense',
            quote:
              'International trips must also be approved by a board member.',
          },
        },
      ],
    },
    'per-diem': {
      key: 'per-diem',
      title: 'Per diem and hotel limits',
      summary: 'Per diem rates and hotel limits for domestic travel.',
      claims: [
        {
          text: 'The domestic per diem is EUR 15 a day.',
          source: {
            doc: 'travel-expense',
            quote: 'The domestic per diem is EUR 15 per day of travel.',
          },
        },
        {
          text: 'Hotels: up to EUR 140 in capital cities, EUR 110 elsewhere.',
          source: {
            doc: 'travel-expense',
            quote:
              'The hotel limit is EUR 140 per night in capital cities and EUR 110 per night elsewhere.',
          },
        },
      ],
    },
    'company-card': {
      key: 'company-card',
      title: 'Company card',
      summary: 'Rules for using the company payment card.',
      claims: [
        {
          text: 'The card may not be used for private expenses.',
          source: {
            doc: 'travel-expense',
            quote:
              'The company card may not be used for private expenses, even if repaid later.',
          },
        },
      ],
    },
  },
  threads: {
    hr: [
      {
        title: 'How many days of leave do I get?',
        question:
          'I have been at Nordwind for 3 years. How many days of annual leave do I get in 2026?',
        answer:
          'You are entitled to **26 days** of annual leave in 2026. The current leave policy gives 26 days to every employee on an employment contract, including those with less than 10 years of service — a board decision above the statutory minimum [1]. The approved knowledge page "Annual leave" states the same rule [2].\n\nNote: the older 2023 HR FAQ says 20 days for less than 10 years of service [3]. That is out of date — the 2026 policy applies.\n\nRemember that carried-over leave must be taken by 30 September of the following year [1].',
        sources: [
          {
            ref: 'leave-policy',
            snippet:
              'Every employee on an employment contract is entitled to 26 days of paid annual leave per calendar year. This also applies to employees with less than 10 years of service — a board decision that goes beyond the statutory minimum.',
          },
          {
            ref: 'page:annual-leave',
            snippet:
              'Every employee on an employment contract gets 26 days of leave a year, regardless of length of service. Carried-over leave must be taken by 30 September of the following year.',
          },
          {
            ref: 'hr-faq',
            snippet:
              'How many days of leave do I get? Employees are entitled to 20 days of annual leave per year, rising to 26 days after 10 years of service.',
          },
          {
            ref: 'remote-work',
            snippet: 'Office staff may work remotely up to 3 days per week.',
          },
        ],
        followUp: {
          question: 'And how far in advance do I have to request it?',
          answer:
            'You submit the leave request in the HR system **at least 7 working days** before the leave starts [1]. If the leave lasts longer than 5 working days, it must be approved by both your line manager and the head of department [1].\n\nThe 2023 HR FAQ mentions an email to your manager 3 days ahead [2] — that rule no longer applies.',
          sources: [
            {
              ref: 'leave-policy',
              snippet:
                'A leave request must be submitted at least 7 working days before the leave starts. Leave longer than 5 working days must be approved by both the line manager and the head of department.',
            },
            {
              ref: 'hr-faq',
              snippet:
                'How do I request leave? Send a request by email to your line manager at least 3 days before the leave.',
            },
          ],
        },
      },
      {
        title: 'How many remote days per week?',
        question:
          'How many days a week can I work from home, and is there an allowance for it?',
        answer:
          'Since 1 March 2026 office staff may work remotely **up to 3 days per week**, with the whole team in the office on Tuesdays [1]. Each remote day earns an allowance of **EUR 2** towards energy and internet [1].\n\nCompany systems may only be accessed over the VPN [1].',
        sources: [
          {
            ref: 'remote-work',
            snippet:
              'Office staff may work remotely up to 3 days per week. Remote days are agreed with the line manager one week in advance, and every Tuesday the whole team works from the office.',
          },
          {
            ref: 'hr-faq',
            snippet:
              'Can I work from home? Remote work is possible for 1 day per week by agreement with your line manager.',
          },
          {
            ref: 'onboarding',
            snippet:
              'IT prepares the laptop, the domain account and VPN access.',
          },
        ],
      },
      {
        title: 'Onboarding a new team member',
        question:
          'Someone new joins my team on Monday. What do I need to prepare as their manager?',
        answer:
          'As the line manager you have three things to do before and after the start date:\n\n1. **Assign a buddy** for the first 3 months [1].\n2. **Book a first-week meeting** to agree objectives for probation [1].\n3. **Schedule the end-of-probation review** — no later than day 80 of employment [1].\n\nHR sends the contract and medical referral, and IT prepares the laptop and access [1]. The new starter must complete GDPR training within 5 working days [2].',
        sources: [
          {
            ref: 'page:onboarding',
            snippet:
              'HR sends the contract and medical referral 5 working days before the start date. The line manager assigns a buddy for the first 3 months. Probation is reviewed no later than day 80.',
          },
          {
            ref: 'onboarding',
            snippet:
              'Data protection (GDPR) training is mandatory and must be completed within 5 working days.',
          },
          {
            ref: 'code-of-conduct',
            snippet:
              'A conflict of interest is reported to the Compliance Officer before the decision it concerns is taken.',
          },
        ],
      },
      {
        title: 'Expenses for a trip to Hamburg',
        question:
          'I am going to Hamburg for two days to meet a customer. What is my hotel limit and the per diem?',
        answer:
          'For the Hamburg trip these limits apply:\n\n- **Hotel:** up to EUR 110 per night (the EUR 140 limit applies to capital cities only) [1].\n- **Per diem:** EUR 15 per day of travel [1].\n\nYour line manager must approve the trip in the expense system before you book [2]. Settle expenses within 14 days of your return, with scanned invoices issued to Nordwind Logistics Ltd. [2]',
        sources: [
          {
            ref: 'page:per-diem',
            snippet:
              'The domestic per diem is EUR 15 a day. Hotels: up to EUR 140 in capital cities, EUR 110 elsewhere.',
          },
          {
            ref: 'travel-expense',
            snippet:
              'Every business trip must be approved by the line manager in the expense system before booking. Expenses are settled within 14 days of the end of the trip, with scanned invoices attached.',
          },
          {
            ref: 'fleet-safety',
            snippet:
              'Phones may only be used while driving through a hands-free kit.',
          },
        ],
      },
    ],
    sales: [
      {
        title: '10% discount for a 600-pallet customer',
        question:
          'A customer ships about 600 pallets a month and asks for a 10% discount. Can I agree?',
        answer:
          'Not on your own. At 600 pallets a month the customer qualifies for an **8%** volume discount [1]. As an account manager you may grant up to 5% alone, and a discount between 5% and 12% is approved by the sales manager [2] — so 10% needs their approval.\n\nRemember that list prices exclude the fuel surcharge [1].',
        sources: [
          {
            ref: 'price-list',
            snippet:
              'over 500 pallets | 8% … Prices exclude the fuel surcharge, which is updated monthly.',
          },
          {
            ref: 'page:discount-approval',
            snippet:
              'An account manager may grant up to 5% alone. The sales manager approves 5% to 12%.',
          },
          {
            ref: 'sla',
            snippet:
              'We guarantee on-time delivery of 98.5% per month for domestic transport.',
          },
        ],
      },
    ],
    support: [
      {
        title: 'Customer reports a damaged pallet',
        question:
          'A customer reports a damaged pallet delivered 5 days ago. Is the claim in time, and what do we need?',
        answer:
          'Yes, the claim is in time — the customer has **7 days from delivery** [1]. Ask for:\n\n- photos of the packaging and the goods,\n- the consignment note number [1].\n\nIf the driver drew up a damage report on delivery, attach it [1]. Processing takes up to 14 working days [2]. If the damage exceeds EUR 5,000, escalate to Compliance immediately [3].',
        sources: [
          {
            ref: 'returns',
            snippet:
              'A claim for a damaged shipment must be filed within 7 days of delivery. Damage visible on delivery is recorded by the driver in a damage report in the presence of the recipient.',
          },
          {
            ref: 'page:claims',
            snippet:
              'A claim is filed within 7 days of delivery. Processing takes up to 14 working days.',
          },
          {
            ref: 'escalation',
            snippet:
              "Claim above EUR 5,000 | total loss | Support agent | immediately | Compliance and the customer's account manager",
          },
        ],
      },
    ],
  },
  analyticsQuestions: [
    {
      question: 'How many days of leave do I get?',
      docs: ['leave-policy', 'hr-faq'],
      weight: 9,
    },
    {
      question: 'When do I have to use carried-over leave?',
      docs: ['leave-policy'],
      weight: 5,
    },
    {
      question: 'How do I take leave on demand?',
      docs: ['leave-policy'],
      weight: 4,
    },
    {
      question: 'How many days can I work remotely?',
      docs: ['remote-work', 'hr-faq'],
      weight: 7,
    },
    {
      question: 'What is the hotel limit on a business trip?',
      docs: ['travel-expense'],
      weight: 6,
    },
    {
      question: 'What is the domestic per diem?',
      docs: ['travel-expense'],
      weight: 4,
    },
    {
      question: 'When is salary paid in December?',
      docs: ['payroll-calendar', 'hr-faq'],
      weight: 3,
    },
    {
      question: 'What discount can I give without approval?',
      docs: ['quoting-rules', 'price-list'],
      weight: 6,
    },
    {
      question: 'How much is refrigerated transport per km?',
      docs: ['price-list'],
      weight: 4,
    },
    {
      question: 'How long is a quote valid?',
      docs: ['quoting-rules'],
      weight: 2,
    },
    {
      question: 'How long does a customer have to file a claim?',
      docs: ['returns', 'sla'],
      weight: 8,
    },
    {
      question: 'What on-time delivery rate does the SLA guarantee?',
      docs: ['sla'],
      weight: 5,
    },
    {
      question: 'Who do I escalate a P1 ticket to?',
      docs: ['escalation', 'sla'],
      weight: 5,
    },
    {
      question: 'Within how many hours must a data breach be reported?',
      docs: ['gdpr'],
      weight: 4,
    },
    {
      question: 'How long do we keep recipient data?',
      docs: ['gdpr'],
      weight: 3,
    },
    {
      question: 'Can I accept a gift from a customer?',
      docs: ['code-of-conduct'],
      weight: 3,
    },
    {
      question: 'How many hours a day may a driver drive?',
      docs: ['fleet-safety'],
      weight: 4,
    },
    {
      question: 'What should a driver do after a collision?',
      docs: ['fleet-safety', 'escalation'],
      weight: 3,
    },
    {
      question: 'What must a manager prepare before onboarding?',
      docs: ['onboarding'],
      weight: 4,
    },
    {
      question: 'What is the CMR liability limit?',
      docs: ['returns'],
      weight: 2,
    },
    {
      question: 'Does the company pay for a gym membership?',
      docs: [],
      weight: 5,
    },
    { question: 'How do I order fuel for the forklifts?', docs: [], weight: 3 },
    {
      question: 'What are the rates for transport to Germany?',
      docs: [],
      weight: 4,
    },
    {
      question: 'Who approves buying a new tractor unit?',
      docs: [],
      weight: 2,
    },
    { question: 'Is there a night shift allowance?', docs: [], weight: 3 },
  ],
  noAnswer:
    "I couldn't find an answer to this question in the knowledge base documents. Please ask the relevant department directly, or ask an administrator to add the right document.",
  findingText: {
    leaveDays:
      'The 2026 Leave Policy grants 26 days of leave to all employees, while the 2023 HR FAQ states 20 days for less than 10 years of service.',
    leaveNotice:
      'The Leave Policy requires a request in the HR system 7 working days ahead, while the HR FAQ describes an email to the manager 3 days ahead.',
  },
  guardrail: {
    name: 'National insurance numbers in questions',
    description:
      'Blocks questions containing a UK National Insurance number before they reach the model. Added after the August 2026 GDPR audit.',
    pattern: '\\b[A-CEGHJ-PR-TW-Z]{2}\\d{6}[A-D]\\b',
  },
};
