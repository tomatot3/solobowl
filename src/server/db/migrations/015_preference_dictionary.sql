ALTER TABLE reviewed_dictionary DROP CONSTRAINT reviewed_dictionary_kind_check;
ALTER TABLE reviewed_dictionary ADD CONSTRAINT reviewed_dictionary_kind_check
  CHECK(kind IN ('avoidances','allergies','professionalRestrictions','equipment','flavor','dietary','region'));
