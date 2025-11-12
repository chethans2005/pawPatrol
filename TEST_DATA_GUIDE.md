# Pet Adoption System - Test Data Setup Guide

## Problem: Approval Failing with 400 Error

When trying to approve an adoption application, you may get this error:
```
Error: 1644 (45000): approve_adoption: transaction failed
POST http://127.0.0.1:5000/api/adoptions/{id}/approve 400 (BAD REQUEST)
```

## Root Causes

The `approve_adoption` stored procedure requires ALL of the following conditions to be met:

### 1. Pet Must Have Veterinary Record ❌
**Error Message:** "Pet must have at least one veterinary checkup before adoption"

**Check:**
```sql
SELECT * FROM vetrecord WHERE pet_id = {pet_id};
```

**Fix:** Add a vet record
```sql
INSERT INTO vetrecord (pet_id, checkup_date, remarks) 
VALUES ({pet_id}, CURDATE(), 'Healthy pet, approved for adoption');
```

### 2. User Must Have Sufficient Wallet Balance ❌
**Error Message:** "Insufficient funds in user wallet"

**Check:**
```sql
SELECT user_id, username, wallet FROM user WHERE user_id = {user_id};
SELECT pet_id, name, price FROM pet WHERE pet_id = {pet_id};
```

**Fix:** Increase user wallet
```sql
UPDATE user SET wallet = {amount} WHERE user_id = {user_id};
```

### 3. Pet Must Be Available ✅
**Error Message:** "Pet is not available for adoption"

**Check:**
```sql
SELECT pet_id, name, status FROM pet WHERE pet_id = {pet_id};
```

Status must be: `Available` (not `Adopted`, `Reserved`, etc.)

### 4. Application Must Be Pending ✅
**Error Message:** "Application is not pending"

**Check:**
```sql
SELECT application_id, status FROM adopterapplication WHERE application_id = {app_id};
```

Status must be: `pending` (not `approved`, `rejected`)

---

## Complete Setup Script for Testing

Run these commands to set up test data properly:

```sql
-- 1. Check all pets and their requirements
SELECT 
    p.pet_id,
    p.name,
    p.price,
    p.status as pet_status,
    p.shelter_id,
    COUNT(vr.vet_record_id) as vet_records,
    aa.application_id,
    aa.user_id,
    aa.status as app_status,
    u.wallet
FROM pet p
LEFT JOIN vetrecord vr ON p.pet_id = vr.pet_id
LEFT JOIN adopterapplication aa ON p.pet_id = aa.pet_id
LEFT JOIN user u ON aa.user_id = u.user_id
GROUP BY p.pet_id;

-- 2. Add vet records for all pets without them
INSERT INTO vetrecord (pet_id, checkup_date, remarks) 
SELECT DISTINCT p.pet_id, CURDATE(), 'Healthy pet, approved for adoption'
FROM pet p
WHERE p.pet_id NOT IN (
    SELECT DISTINCT pet_id FROM vetrecord
);

-- 3. Increase wallet for all users
UPDATE user SET wallet = 10000 WHERE wallet < 5000;

-- 4. Verify everything is ready
SELECT 
    p.pet_id,
    p.name,
    p.price,
    p.status,
    (SELECT COUNT(*) FROM vetrecord WHERE pet_id = p.pet_id) as vet_count,
    aa.application_id,
    aa.status,
    u.username,
    u.wallet
FROM pet p
LEFT JOIN adopterapplication aa ON p.pet_id = aa.pet_id
LEFT JOIN user u ON aa.user_id = u.user_id
WHERE aa.application_id IS NOT NULL
ORDER BY aa.application_id;
```

---

## Quick Troubleshooting

### For Specific Application ID:

```sql
-- Find the problematic data
SET @app_id = 2;

SELECT 
    aa.application_id,
    aa.user_id,
    aa.pet_id,
    aa.status as app_status,
    u.username,
    u.wallet,
    p.name,
    p.price,
    p.status as pet_status,
    COUNT(vr.vet_record_id) as vet_count
FROM adopterapplication aa
JOIN user u ON aa.user_id = u.user_id
JOIN pet p ON aa.pet_id = p.pet_id
LEFT JOIN vetrecord vr ON p.pet_id = vr.pet_id
WHERE aa.application_id = @app_id
GROUP BY aa.application_id;

-- Fix if needed:
-- 1. Add vet record
INSERT INTO vetrecord (pet_id, checkup_date, remarks)
SELECT p.pet_id, CURDATE(), 'Healthy'
FROM pet p
JOIN adopterapplication aa ON aa.pet_id = p.pet_id
WHERE aa.application_id = @app_id
AND p.pet_id NOT IN (SELECT DISTINCT pet_id FROM vetrecord);

-- 2. Update wallet
UPDATE user u
JOIN adopterapplication aa ON u.user_id = aa.user_id
JOIN pet p ON aa.pet_id = p.pet_id
SET u.wallet = u.wallet + p.price
WHERE aa.application_id = @app_id
AND u.wallet < p.price;
```

---

## Current Status

✅ **Fixed for Application ID 2:**
- Pet 2 (tommy): Added vet record
- User 1 (Devraj999): Wallet increased to $5000 (was $1000, pet costs $2000)

The approval should now work successfully!
