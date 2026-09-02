-- Custom SQL migration file, put your code below! --
CREATE FUNCTION champs_valides(champs jsonb) RETURNS boolean AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(champs) elem
    WHERE (elem->>'genre') NOT IN ('texte','nombre','date','booleen','choix','fichier')
       OR elem->>'cle' IS NULL
       OR elem->>'label' IS NULL
  );
$$ LANGUAGE sql IMMUTABLE;

ALTER TABLE type_element
  ADD CONSTRAINT type_element_champs_genres_valides CHECK (champs_valides(champs));
