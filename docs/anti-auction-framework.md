AI Promt:

I need to protect the contractors and service providers from “auction”
behavior on the FairGround environment. This is behavior is caused when
prospective clients requests the same services from multiple contractors
causing a “bidding war” or an “auction”, per se. is there a way to make
sure clients only submit one request to one contractor?

Here are a few ideas:

- Let clients know that the reason for this app is to ensure that
  contractors are treated fairly and they are not competing for
  requests. If they feel they cannot complete a job, they need to do
  their due diligence to ensure they partner with another contractor to
  get the job done.

- The system flags attempts to requests the same job to multiple
  contractors and informs the client that they are in violation and can
  only request one job to one contractor at a time.

- If the client enters the system through a contractor link, and then
  tries to shop the job to other contractors, the system will not allow.

- It the client enters the system without a link they are encouraged to
  use due diligence to check ratings because they only get one request
  to one contractor.

AI RESULT:

Yes—**you can absolutely protect contractors from auction behavior**,
and the ideas you’ve listed are not only viable, they’re *foundational*
to FairGround’s identity. The key is to combine **values, UX friction,
and hard technical enforcement** so this behavior is **structurally
impossible**, not just discouraged.

Below is a **practical, enforceable framework** you can give directly to
your developer that builds on your ideas and closes the loopholes that
cause bidding wars on other platforms.

**FairGround Anti‑Auction Design Framework**

**Goal:** One client → one request → one contractor (at a time)

This is not a “policy suggestion.”  
It must be **designed into the system at every layer**.

**1. Core Principle (Non‑Negotiable)**

**FairGround does not allow multi‑contractor bidding for the same job.**

This principle must be:

- Stated clearly to clients

- Enforced by software

- Auditable by admins

**2. Client Education (Values + Expectation Setting)**

**✅ Required Pre‑Request Acknowledgement (UX)**

Before submitting *any* request, clients must agree to a short statement
like:

**FairGround is built to treat service providers fairly.**  
You may submit **one active request to one provider at a time**.  
If a provider cannot complete a job, you may submit a new request after
closing the current one.

- Checkbox required to proceed

- Shown once per account and again before first request

- Logged for compliance/auditing

✅ This aligns exactly with your first idea and sets the tone **before
behavior occurs**.

**3. Hard Technical Rule: “One Active Request Lock”**

**✅ Definition of an Active Request**

A request is considered **active** until one of the following happens:

- Provider marks it “Declined”

- Client marks it “Closed”

- System auto‑expires it after X days (e.g., 7–14 days)

- Admin closes it manually

**✅ Enforcement Logic (Must Be Built)**

- A client **cannot submit another request** while an active one exists

- This rule applies **globally across the entire platform**

No “shopping around” in parallel. Ever.

**4. Job Fingerprinting (Flags, Not Guesswork)**

To prevent subtle workarounds, the system should generate a **job
fingerprint** when a request is created.

**✅ Job Fingerprint Inputs**

- Client ID

- Service category

- Service location (ZIP/city)

- Key keywords from description

- Timestamp window (e.g., 24–72 hours)

**✅ System Behavior**

If the client attempts another request that:

- Matches category + location

- Has high similarity in description

- Is within the active window

Then the system:

- **Blocks submission**

- Displays a clear message

**Example System Message (Client‑Facing)**

You already have an active request for this type of service.  
FairGround allows only one active request at a time to ensure service
providers are treated fairly.

This directly implements your **second idea**, but does so *reliably*.

**5. Contractor Link Protection (Very Important)**

**✅ Rule: Contractor Link = Exclusive Path**

If a client enters FairGround through a **contractor’s unique link**:

- That request is **hard‑locked** to that contractor

- The client **cannot browse or request others** until the request is
  resolved

- Navigation to other providers is disabled or hidden

**✅ Rationale**

This protects:

- Contractor marketing spend

- Relationship ownership

- Trust in the FairGround model

This implements your **third idea** with **absolute technical
enforcement**, not just UX discouragement.

**6. Network Browsing Without a Link (One‑Choice Model)**

When a client enters FairGround *without* a contractor link:

**✅ Required UX Flow**

1.  Client browses businesses

2.  System prominently states:

> *You may submit one active request to one provider at a time. Please
> review profiles carefully.*

3.  Client selects **one** provider

4.  System locks selection until request resolution

**✅ Optional Enhancements (Highly Recommended)**

- Verified reviews

- Ratings

- Response‑time indicators

- “Typical job types handled”

This supports your **fourth idea** while ensuring fairness through
design.

**7. Anti‑Circumvention Controls (Critical)**

Clients *will* try to game the system. You must assume this.

**✅ Controls to Implement**

- Email + phone verification required

- Rate limits by:

  - IP address

  - Phone number

  - Device fingerprint

- Duplicate account detection for same phone/email

- Temporary blocks if abuse is detected

**✅ Escalation**

- First violation: education + warning

- Second violation: temporary lockout

- Third violation: account suspension

Admins need visibility and override ability.

**8. Provider‑Facing Guarantees (This Is a Selling Point)**

On the provider dashboard and marketing site, state clearly:

**FairGround guarantees that every request you receive is exclusive.**  
We do not allow bidding wars, shared requests, or multi‑contractor
shopping.

This transforms anti‑auction logic into a **core value proposition**.

**9. Admin & Audit Requirements**

**✅ Admin Must Be Able To:**

- See request lineage (how client entered)

- View job fingerprints

- Flag and close abuse cases

- Restore a client’s ability to submit requests if appropriate

This ensures the system remains fair **without being punitive**.

**10. Summary: How FairGround Stops Auctions (At a Glance)**

| **Risk Behavior**                 | **FairGround Solution**  |
|-----------------------------------|--------------------------|
| Client shops multiple contractors | One active request lock  |
| Client retries same job           | Job fingerprint blocking |
| Contractor link hijacking         | Link‑based exclusivity   |
| Anonymous bidding                 | Verified accounts only   |
| Parallel comparing                | Locked workflow          |
| “Lead blasting”                   | Structural impossibility |

**Final Verdict**

✅ **Yes, you can guarantee one request → one contractor**  
✅ **Yes, your ideas are sound**  
✅ **The key is structural enforcement, not trust**

FairGround will succeed where others failed because **you are not asking
for better behavior—you are designing it**.

**If you want next:**

I can:

- Convert this into **technical acceptance criteria**

- Write the **client‑facing fairness policy**

- Draft **provider trust language for the marketing site**

- Stress‑test edge cases (complex jobs, referrals, subcontracting)

Just tell me how far you want to take it.
