import pandas as pd

all_data = []

for i in range(1, 11):
    subj_id = f'subj{i:02d}'  # Formats as subj01, subj02, etc.
    
    try:
        # Read marker data with encoding
        markers = pd.read_csv(f'{subj_id}.marker.csv', header=None, names=['Event', 'Time'], encoding='latin1')
        
        # Get the earliest timestamp for each unique event
        markers = markers.groupby('Event')['Time'].min().reset_index()
        
        # Extract timestamps for events 1, 2, 3
        event1_time = markers[markers['Event'] == 1]['Time'].values[0]  # End of resting
        event2_time = markers[markers['Event'] == 2]['Time'].values[0]  # Stand up
        event3_time = markers[markers['Event'] == 3]['Time'].values[0]  # Sit down
        
        # Read main data with encoding
        df = pd.read_csv(f'{subj_id}.csv', encoding='latin1')
        
        # Clean column names by removing triple quotes
        df.columns = df.columns.str.strip('"""')
        
        # Add 'Subject' column
        df['Subject'] = subj_id
        
        # Add 'Phase' column based on Time and marker timestamps
        df['Phase'] = pd.cut(df['Time'],
                             bins=[-float('inf'), event1_time, event2_time, event3_time, float('inf')],
                             labels=['Resting', 'Preparing', 'Standing', 'Sitting'],
                             right=False)  # Intervals are [start, end)
        
        # Append this subject's dataframe to the list
        all_data.append(df)
    
    except FileNotFoundError:
        print(f"Warning: Could not find files for {subj_id}. Check file names and paths. Skipping this subject.")
        continue
    except IndexError:
        print(f"Warning: Missing event markers for {subj_id}. Skipping this subject.")
        continue
    except UnicodeDecodeError:
        print(f"Error: Encoding issue with {subj_id}. Tried 'latin1', but it failed. Skipping this subject.")
        continue
    except Exception as e:
        print(f"Unexpected error processing {subj_id}: {e}. Skipping this subject.")
        continue

# Combine all dataframes into one
combined_df = pd.concat(all_data, ignore_index=True)

# Save to a single CSV file
combined_df.to_csv('combined_data.csv', index=False)

print("Combined CSV file 'combined_data.csv' has been created successfully!")