# How to Download FEC Donor Data

## Quick Steps

1. Go to: **https://www.fec.gov/data/receipts/individual-contributions/?committee_id=C00639591&contributor_state=VA**
   - This shows all individual contributions to **AOC (Alexandria Ocasio-Cortez)** from **Virginia**
   - Committee: C00639591 (ALEXANDRIA OCASIO-CORTEZ FOR CONGRESS)

2. Click **"Export"** (top right) → Download the CSV

3. Run the processing script:
   ```bash
   python3 scripts/process_fec_donors.py path/to/downloaded.csv
   ```

4. This generates `data/donors.json` — commit and push.

## Want Other Recipients Too?

You can download data for multiple committees. Common progressive ones:

| Recipient | Committee ID | FEC URL |
|-----------|-------------|---------|
| AOC | C00639591 | [Link](https://www.fec.gov/data/receipts/individual-contributions/?committee_id=C00639591&contributor_state=VA) |
| Bernie Sanders | C00577130 | [Link](https://www.fec.gov/data/receipts/individual-contributions/?committee_id=C00577130&contributor_state=VA) |
| Elizabeth Warren | C00693234 | [Link](https://www.fec.gov/data/receipts/individual-contributions/?committee_id=C00693234&contributor_state=VA) |
| ActBlue | C00401224 | [Link](https://www.fec.gov/data/receipts/individual-contributions/?committee_id=C00401224&contributor_state=VA) |

Run the script for each and it'll merge them all into `donors.json`.

## Data Format

The script matches donors to apartment buildings in `data/apartments.json` by street address. The output format:

```json
{
  "donors": [
    {
      "name": "SMITH, JANE",
      "street": "1234 MAIN ST APT 5",
      "city": "ARLINGTON",
      "zip": "22201",
      "employer": "TECH CO",
      "occupation": "SOFTWARE ENGINEER",
      "amount": 50.0,
      "total_amount": 150.0,
      "num_contributions": 3,
      "date": "2024-06-15",
      "recipient": "OCASIO-CORTEZ, ALEXANDRIA",
      "apartment": "THE MAIN STREET APTS",
      "building": "THE MAIN STREET APTS"
    }
  ]
}
```
