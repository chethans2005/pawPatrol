# Adoption Application Approval Requirements

When an admin approves an adoption application, the system checks the following requirements:

## Requirements for Approval

1. **Pet Must Have Veterinary Records**
   - The pet must have at least one entry in the `VetRecord` table
   - This ensures the pet has been checked by a vet before adoption
   - Add a vet record:
     ```sql
     INSERT INTO vetrecord (pet_id, checkup_date, remarks) 
     VALUES (pet_id, CURDATE(), 'Healthy, approved for adoption');
     ```

2. **User Must Have Sufficient Wallet Balance**
   - If the pet has a price > 0, the user must have enough funds
   - The price is deducted from the user's wallet upon approval
   - The amount goes to the shelter's revenue
   - Example: Pet costs $1000, user needs at least $1000 in wallet

3. **Pet Must Be Available**
   - Pet status must be 'Available' (not already adopted)

4. **Application Must Be Pending**
   - Application status must be 'pending'
   - Once approved or rejected, no further actions can be taken

## Error Troubleshooting

### 400 Bad Request - "Pet must have at least one veterinary checkup"
**Solution:** Add a vet record for the pet in the database

### 400 Bad Request - "Insufficient funds in user wallet"
**Solution:** Add funds to the user's wallet using the wallet endpoint or directly update the database

### 400 Bad Request - "Pet is not available for adoption"
**Solution:** Check that the pet's status is 'Available', not 'Adopted' or 'Reserved'

## Database Setup for Testing

```sql
-- Add test vet record for pet ID 1
INSERT INTO vetrecord (pet_id, checkup_date, remarks) 
VALUES (1, CURDATE(), 'Healthy pet, approved for adoption');

-- Add wallet funds to user ID 1
UPDATE user SET wallet = 5000 WHERE user_id = 1;
```
