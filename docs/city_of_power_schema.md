# City of Power
## Database Schema (Logical Model)

---

# 1. Agents Table

Agents
- id (PK)
- role
- wealth
- influence
- radicalization
- alignment
- happiness
- trust_in_government
- religion_id (FK)
- caste_id (FK)
- language_id (FK)

---

# 2. IdentityGroups Table

IdentityGroups
- id (PK)
- type (religion/caste/language)
- name
- population_percent
- economic_modifier
- education_modifier
- grievance_score
- radicalization_base_rate

---

# 3. Relationships Table

Relationships
- id (PK)
- agent_id (FK)
- target_agent_id (FK)
- strength

---

# 4. CityStats Table

CityStats
- economy
- employment
- law_order
- infrastructure
- environment
- corruption
- social_tension
- media_freedom
- public_trust

---

# 5. Events Table

Events
- id (PK)
- type
- escalation_level
- active
- affected_groups
- impact_json

---

# 6. Media Table

Media
- bias
- sensationalism
- trust

---

# 7. Elections Table

Elections
- turn_number
- mayor_vote_share
- opposition_vote_share
- outcome

---

# 8. Policies Table

Policies
- id (PK)
- name
- effects_json
- long_term_modifier
