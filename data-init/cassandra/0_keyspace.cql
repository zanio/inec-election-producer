CREATE KEYSPACE IF NOT EXISTS data_digestion
   WITH REPLICATION = {
     'class' : 'SimpleStrategy',
     'replication_factor' : 1
    };