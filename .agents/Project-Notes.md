<!-- # Created by Caleb M. Irvine for use by Moto Reloaded -->

# Pre-Project Notes & Stakeholder Debrief

**Stakeholders to consider:** Riders/sellers, store clerk (Alex), owners (Mathias & Barbara), hackathon organizers/judges (Anu & Robin), and broader motorcycle enthusiasts.

---

## Hackathon Logistics
- **Build Window:** 10:30 AM – 4:30 PM (~6 hours)
- **Demo Setup (Anu):** Local machine demo via Microsoft Teams (mobile QR handoff + desktop view works great for live Teams screen-sharing!).
- **Judging / Concept Signals (Robin):**
  - Brand research & recognition
  - Tag/label extraction (brand, CE, composition)
  - Material understanding
  - Image processing quality
  - Open to novel, creative concepts — not just a rigid form clone

---

## Owners' Vision — Mathias & Barbara
- **Mission First: Rider Safety + Sustainability + Upcycling**
  - The core goal is **getting more riders safer** and **keeping salvageable materials out of landfill**, rather than just reselling used gear for the sake of it.
  - **Rider awareness gap:** Most riders don't realize how safety gear degrades over time (hidden breakdowns, UV/wash degradation, waterproof membranes losing waterproofing). People hoard old gear instead of replacing it.
  - **Material lifespans & realities:**
    - **Good old leather** jackets/pants are often still structurally sound and worth keeping in circulation (or upcycling leather into bags/accessories if retired as riding gear).
    - **Modern textile fabrics (10–15 years old)** pose real safety/degradation concerns; functional waterproof membranes typically fail over time.
    - **Hardware/Zippers (Barbara):** Physical wear like broken/failing zippers is immediately inspectable and crucial to jacket usability.
    - **Cheap brands are NEVER worth consigning:** Low-abrasion cheap gear was barely protective when new and has zero consignment value. Moto Reloaded is a small startup and cannot buy every jacket — it operates as a **curated consignment platform** backed by Moto Reloaded's standards.
  - **Turning Safety & Sustainability into a Business / Sales Tool:**
    - Build an achievable **recycle / upcycle pathway** (e.g., repurposing leather into bags or other goods) for gear that shouldn't be resold as riding gear.
    - Use the assessment workflow as a **trust-building sales & trade-in tool**: help riders understand when old gear is past its prime, trade it in responsibly for upcycling/recycling, and upgrade into **modern, lighter, safer new gear** from the shop.
    - Smartphone-first intake that collects structured data and recognizes garments cleanly.

---

## Store Clerk Workflow — Alex
- **Current Process:** Old gear comes in -> Alex physically inspects items -> manually tracks everything in spreadsheets (OneDrive / Excel `reloaded-labs-shot-checklist.xlsx`) and physical grading sheets (`item-grading-sheet-v2.docx`).
- **Key Pain Points & Requirements:**
  - **Clear garment-aware shot labeling:** Distinguish context explicitly (e.g., left pocket of pants vs. left pocket of jacket, Zone 1 mapping by garment type).
  - **No universal industry standard:** Every garment is constructed differently — the app needs to apply a clear **visual legend / rubric** consistently across items rather than inventing arbitrary numeric scores.
  - **What matters most visually:** Not just obvious surface abrasion — **stitches, yarn integrity, seams, and lining** matter. If stitching/yarn already looks off, the garment is giving up.
  - **Condition Class Intuition:**
    - **A:** Like new
    - **B:** Light/normal use, solid resale candidate
    - **C:** Contact / **human decider** required (borderline — clerk/owner must judge physically)
    - **D:** Defective — cannot take it for resale ("not a protective jacket or pant anymore" -> route to upcycling/retirement)

---

## Labels, Materials & Scope Rules
- **Scope:** Motorcycle **jackets and pants only** (explicitly **NOT helmets**).
- **Composition Label:** Extract fibre breakdown to understand abrasion-resistant material types (UHMWPE, para-aramid, polyamide, polyester, leather, cotton) — while remembering photos alone cannot certify fibre integrity.
- **CE Labels (EN 17092):**
  - European standard, widely adopted **2018+**.
  - **North American brands frequently have NO CE label** — absence of a CE label does NOT mean the item is unprotective or fake.
- **Brand Tier Awareness:**
  - Established protective brands carry resale/consignment potential.
  - Cheap/fashion/low-abrasion brands are never worth buying or consigning for riding resale (still eligible for responsible recycling/upcycling guidance).
- **Condition Class Alone Isn't Enough:** Visual condition (A/B/C/D) must be paired with **material/label disclosure + rider usage history** (`Protection Status`: confirmed / reduced / unknown) and **safety gates**.
