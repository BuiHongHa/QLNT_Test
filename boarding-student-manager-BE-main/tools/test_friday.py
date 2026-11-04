from datetime import date, timedelta

def old_friday_of_week(day):
    return day + timedelta(days=(4 - day.weekday()) % 7)

def new_friday_of_week(day):
    return day - timedelta(days=day.weekday()) + timedelta(days=4)

# Test from Monday June 15 to Sunday June 21
start_date = date(2026, 6, 15)
for i in range(7):
    current = start_date + timedelta(days=i)
    day_name = current.strftime('%A')
    old_f = old_friday_of_week(current)
    new_f = new_friday_of_week(current)
    print(f"{day_name} ({current}):")
    print(f"  Old: {old_f}")
    print(f"  New: {new_f}")
