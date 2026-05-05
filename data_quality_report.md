# Data Quality Report — `wolves_data.xlsx`

**Generated:** 2026-05-02 02:55  
**Source sheet:** `נתוני זיהוי זאבים (2)` (104 rows × 28 cols)

## Summary

| Severity | Categories | Total rows flagged |
|---|---:|---:|
| ❌ Errors (must fix) | 3 | 30 |
| ⚠ Warnings (likely issues) | 5 | 66 |
| ℹ Info (FYI) | 6 | 99 |


## ❌ Errors

### code present but #pictures = 0
1 wolf(ves): code exists but pictures=0 — likely typo, fix #pictures

| serial | code | _id |
|---|---|---|
| O80 | b3k_a1k_b_d_a1a_b1j_c_a5b5_a1 | code_present_but_pictures_0__O80__ |

### time on camera unparseable
2 entry(ies) don't match any accepted format (dd.mm.yy / d-d.mm.yy / d.m-d.m.yy / dd.mm.yy-dd.mm.yy / m.yyyy / m.yyyy-m.yyyy)

| serial | value | reason | _id |
|---|---|---|---|
| Y42 | 30.9.20-27.10 | unparseable | time_on_camera_unparseable__Y42__ |
| O68 | 29.8-29 | unparseable | time_on_camera_unparseable__O68__ |

### seen with references unknown wolf
27 reference(s) point to a serial not present in the table

| from_serial | seen_with | missing_reference | _id |
|---|---|---|---|
| F23 | F21s, F24 | F21s | seen_with_references_unknown_wolf__F23__F21s |
| F24 | F23, F21s | F21s | seen_with_references_unknown_wolf__F24__F21s |
| Y27 | seen together | seen together | seen_with_references_unknown_wolf__Y27__seen_together |
| Y29 | seen together | seen together | seen_with_references_unknown_wolf__Y29__seen_together |
| Y30 | seen together | seen together | seen_with_references_unknown_wolf__Y30__seen_together |
| Y31 | seen together | seen together | seen_with_references_unknown_wolf__Y31__seen_together |
| Y107 | seen together | seen together | seen_with_references_unknown_wolf__Y107__seen_together |
| Y33 | seen together | seen together | seen_with_references_unknown_wolf__Y33__seen_together |
| Y34 | seen together | seen together | seen_with_references_unknown_wolf__Y34__seen_together |
| Y35 | seen together | seen together | seen_with_references_unknown_wolf__Y35__seen_together |
| Y38 | seen together | seen together | seen_with_references_unknown_wolf__Y38__seen_together |
| Y39 | seen together | seen together | seen_with_references_unknown_wolf__Y39__seen_together |
| Y40 | seen together | seen together | seen_with_references_unknown_wolf__Y40__seen_together |
| Y41 | seen together | seen together | seen_with_references_unknown_wolf__Y41__seen_together |
| Y42 | seen together | seen together | seen_with_references_unknown_wolf__Y42__seen_together |
| Y43 | seen together | seen together | seen_with_references_unknown_wolf__Y43__seen_together |
| Y44 | seen together | seen together | seen_with_references_unknown_wolf__Y44__seen_together |
| Y45 | seen together | seen together | seen_with_references_unknown_wolf__Y45__seen_together |
| Sh49 | Sh37y | Sh37y | seen_with_references_unknown_wolf__Sh49__Sh37y |
| Sh50 | 7 min after Sh49+Sh37y | 7 min after Sh49+Sh37y | seen_with_references_unknown_wolf__Sh50__7_min_after_Sh49+Sh37y |
| Sh52 | Sh53+1 unrecognized | Sh53+1 unrecognized | seen_with_references_unknown_wolf__Sh52__Sh53+1_unrecognized |
| Sh53 | Sh52+1 unrecognized | Sh52+1 unrecognized | seen_with_references_unknown_wolf__Sh53__Sh52+1_unrecognized |
| Sh55 | seen together | seen together | seen_with_references_unknown_wolf__Sh55__seen_together |
| Sh57 | seen together? | seen together | seen_with_references_unknown_wolf__Sh57__seen_together |
| Sn85 | seen together | seen together | seen_with_references_unknown_wolf__Sn85__seen_together |
| In92 | seen together | seen together | seen_with_references_unknown_wolf__In92__seen_together |
| In93 | seen together | seen together | seen_with_references_unknown_wolf__In93__seen_together |


## ⚠ Warnings

### code != concat(A1, A2, B3, B4, B5, C6, C7, D8, D9)
26 wolf(ves): the 'code' string doesn't match the joined region cells

| serial | code (actual) | concat A1..D9 | _id |
|---|---|---|---|
| M4 | d2k_a7kl_b_b_b_c2j_b2_a5_a2 | d2k_a7k_b_b_b_c2j_b2_a5_a2 | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__M4__ |
| M6H | b1k_a1i_a3_c1_c1_c3i_a2_a3b5_b2 | b1k_a1i_a3_c1_c1_c3i_a2_a3b5_a2 | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__M6H__ |
| H12 | d2l_a1kl_N_N_N_P_a1_a5b5_a1 | d2l_a1k_N_N_N_P_a1_a5b5_a1 | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__H12__ |
| H13S | a1txi_a3i_b_c1a_c1a_c1g_b2_a4b5_a4 | a1txi_a3i_b_c1a_a1a_c1g_b2_a4b5_a4 | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__H13S__ |
| H14 | a4vyf_a3f_a2_c1_c1_c3g_c3_a3_N | a4vyf_a3f_a2_c1_c1_c3g_a3_a3_N | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__H14__ |
| K16 | b1i_a3i_N_N_N_b1ic7c_a4b5_a2 | b1i_a3i_N_N_N_b1i_c_a4b5_a2 | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__K16__ |
| F104 | a2wzf_a11e_a2b_b1b_Ra1bLa2b_c3g_c_a4b5_a1 | a2wf_a11e_a2b_b1b_Ra1bLa2b_c3g_c_a4b5_a1 | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__F104__ |
| F23 | z1i_a5i_P_Pb5N_N_N_N_N | z1i_a5i_P_P_N_N_N_N_N | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__F23__ |
| Y27 | a3vze_a4e_a2a_d_a1b_c1e_a1_a1b1d9a2 | a3vze_a4e_a2a_d_a1b_c1e_a1_a1b1_a2 | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__Y27__ |
| Y101 | a4uze_a4e_a2b_c2b_c2b_c1e_a3d8a3b5_a2 | a4uze_a4e_a2b_c2b_c2b_c1e_a3_a3b5_a2 | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__Y101__ |
| Y28 | N_a1k_PP_PP_P_ci_N_a6b5_a1 | N_a1k_P_P_P_ci_N_a6b5_a1 | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__Y28__ |
| Y29 | c1zf_a5f_a3a_c2a_c2a_c1f_a1D_a3b4_a3 | c1zf_a5f_a3a_c2a_c2a_c1f_a1_a3b4_a3 | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__Y29__ |
| Y31 | f_N_b_Rb1aLc2a_Ra1aLc2a_f_p_a3_N | f_N_b_Rb1aLc2a_Ra1aLc2a_f_P_a3_N | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__Y31__ |
| Y33 | a1tze_a4e_b_b1b_a1b_c1e_c1e_a3_a3_a2 | a1tze_a4e_b_b1b_a1b_c1e_a3_a3_a2 | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__Y33__ |
| Y39 | b3j_a9j_b_Rb1aLd_Ra2bLd6_N_N_a6_N | b3j_a9j_Rb1aLd_Rb1aLd_Ra2bLd_N_N_a6_N | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__Y39__ |
| Y43 | a1txj_a4_b_d_a1a_c3g_b2_a4_a2 | a1txj_a4j_b_d_a1a_c3g_b2_a4_a2 | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__Y43__ |
| Y44 | a5uyf_a1i_b_b2b_a1b_a4g_c_a4b5_a2 | a5uyf_a1u_b_b2b_a1b_a4g_c_a4b5_a2 | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__Y44__ |
| Y37 | a3uzf_a4f_N_b1a_b1a_c3f_a1_a4b1_a2 | a3uzf_a4f_N_b1a_b1a_c3f_a1_a4b1_a3 | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__Y37__ |
| Sh109 | a3vzf-a4f-N-b2a-a2a-a4h-a1-a3-a4 | a3zf_a4f_N_b2a_a2a_a3h_a1_a3_a4 | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__Sh109__ |
| Sh54 | c1yi_a5i_b_d_d_c3g_b1_a3b5_a4 | c1yi_a5i_b_d_d_c3g_b2_a3b5_a4 | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__Sh54__ |
| O71 | b4i_a8i_b_b2b_a1b_c1g_a1_a4b5_a2 | b4f_a8i_b_b2b_a1b_c1g_a1_a4b5_a2 | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__O71__ |
| O72 | a1wyi_a4i_b_d_N_c3i_b1_a3b5_a2 | a1wyi_a4i_b_d_N_c3i_b2_a3b5_a2 | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__O72__ |
| O77 | Ra3vzfLb1f_a2f_a2b_b2b_a1b_b1g_c_a4_a2 | Ra3vzfLb1f_a2f_a2b_b2b_a1b_b1g_c_a1_a2 | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__O77__ |
| O82 | b2l_N_N_Pa_N_dl_c_a8_a1 | b2l_N_Pa_N_dl_c_c_a8_a1 | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__O82__ |
| Sn84 | a1txg_a1g_N_N_b1h_c_a4_a2 | a1txg_a1g_N_N_N_b1h_c_a4_a2 | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__Sn84__ |
| In92 | a2ze_e_a2a_b1b_a2b_e_P_N_N | a2ze_e_a2a_b1b_a2b_c1f_P_N_N | code_concat_a1_a2_b3_b4_b5_c6_c7_d8_d9__In92__ |

### gender not in {m, f, blank}
2 row(s): unexpected gender value (case, whitespace, or other)

| serial | value | _id |
|---|---|---|
| S19 | '?' | gender_not_in_m_f_blank__S19__ |
| F21 | '?' | gender_not_in_m_f_blank__F21__ |

### social dynamic out of {pack, group, unknown}
24 row(s): unexpected value

| serial | value | _id |
|---|---|---|
| H12 | 'lone' | social_dynamic_out_of_pack_group_unknown__H12__ |
| H13S | 'lone' | social_dynamic_out_of_pack_group_unknown__H13S__ |
| H99 | 'lone' | social_dynamic_out_of_pack_group_unknown__H99__ |
| H14 | 'lone' | social_dynamic_out_of_pack_group_unknown__H14__ |
| H15m | 'lone' | social_dynamic_out_of_pack_group_unknown__H15m__ |
| K16 | 'lone' | social_dynamic_out_of_pack_group_unknown__K16__ |
| K106 | 'lone' | social_dynamic_out_of_pack_group_unknown__K106__ |
| K17f | 'lone' | social_dynamic_out_of_pack_group_unknown__K17f__ |
| S18 | 'lone' | social_dynamic_out_of_pack_group_unknown__S18__ |
| S100 | 'lone' | social_dynamic_out_of_pack_group_unknown__S100__ |
| S19 | 'lone' | social_dynamic_out_of_pack_group_unknown__S19__ |
| S20 | 'lone' | social_dynamic_out_of_pack_group_unknown__S20__ |
| F26 | 'lone' | social_dynamic_out_of_pack_group_unknown__F26__ |
| Y101 | 'lone' | social_dynamic_out_of_pack_group_unknown__Y101__ |
| Y28 | 'lone' | social_dynamic_out_of_pack_group_unknown__Y28__ |
| Y102 | 'pack*' | social_dynamic_out_of_pack_group_unknown__Y102__ |
| Y46 | 'lone' | social_dynamic_out_of_pack_group_unknown__Y46__ |
| Sh59 | 'lone' | social_dynamic_out_of_pack_group_unknown__Sh59__ |
| Sl65 | 'lone' | social_dynamic_out_of_pack_group_unknown__Sl65__ |
| O66 | 'lone' | social_dynamic_out_of_pack_group_unknown__O66__ |
| Sn83 | 'lone' | social_dynamic_out_of_pack_group_unknown__Sn83__ |
| Sn84 | 'lone' | social_dynamic_out_of_pack_group_unknown__Sn84__ |
| Ma87sn | 'lone' | social_dynamic_out_of_pack_group_unknown__Ma87sn__ |
| Ma88 | 'lone' | social_dynamic_out_of_pack_group_unknown__Ma88__ |

### cams_spotted: non-numeric token
12 entry(ies) contain a token that is not a camera ID

| serial | value | non_numeric_token | _id |
|---|---|---|---|
| O66 | 31, omer weiner | omer weiner | cams_spotted_non_numeric_token__O66__ |
| In89 | omer weiner | omer weiner | cams_spotted_non_numeric_token__In89__ |
| Mg90 | omer weiner | omer weiner | cams_spotted_non_numeric_token__Mg90__ |
| In91 | ariel shamir | ariel shamir | cams_spotted_non_numeric_token__In91__ |
| In92 | ariel shamir | ariel shamir | cams_spotted_non_numeric_token__In92__ |
| In93 | ariel shamir | ariel shamir | cams_spotted_non_numeric_token__In93__ |
| In94 | ariel shamir | ariel shamir | cams_spotted_non_numeric_token__In94__ |
| In95 | omer weiner | omer weiner | cams_spotted_non_numeric_token__In95__ |
| In96 | omer weiner | omer weiner | cams_spotted_non_numeric_token__In96__ |
| In97 | elimelech | elimelech | cams_spotted_non_numeric_token__In97__ |
| In98 | moshe_neeman | moshe_neeman | cams_spotted_non_numeric_token__In98__ |
| In105 | nevo_ | nevo_ | cams_spotted_non_numeric_token__In105__ |

### polygon name casing inconsistency
2 polygon(s) appear with multiple capitalisations

| canonical_lower | forms | _id |
|---|---|---|
| hazeka | ['Hazeka', 'hazeka'] | polygon_name_casing_inconsistency__item0__ |
| saki | ['Saki', 'saki'] | polygon_name_casing_inconsistency__item1__ |


## ℹ Info

### rows with empty 'serial number'
1 row(s) lack a serial number — only the trailing blank row is expected

| row_index | code | area | #pictures | _id |
|---|---|---|---|---|
| 103 | (empty) | (empty) | 0 | rows_with_empty_serial_number__row103__ |

### 'pack name' vs 'שיוך' diverge
66 row(s) differ between the two columns — for user's manual cleanup

| serial | pack name | שיוך | _id |
|---|---|---|---|
| M3 | (blank) | makhfi unknown | pack_name_vs_diverge__M3__ |
| M6H | (blank) | makhfi unknown | pack_name_vs_diverge__M6H__ |
| M10 | (blank) | makhfi unknown | pack_name_vs_diverge__M10__ |
| F22 | ? | (blank) | pack_name_vs_diverge__F22__ |
| F25 | ? | (blank) | pack_name_vs_diverge__F25__ |
| F26 | lone | (blank) | pack_name_vs_diverge__F26__ |
| Y27 | dark pack | (blank) | pack_name_vs_diverge__Y27__ |
| Y101 | lone | (blank) | pack_name_vs_diverge__Y101__ |
| Y28 | lone | (blank) | pack_name_vs_diverge__Y28__ |
| Y29 | dark pack | (blank) | pack_name_vs_diverge__Y29__ |
| Y30 | dark pack | (blank) | pack_name_vs_diverge__Y30__ |
| Y31 | dark pack | (blank) | pack_name_vs_diverge__Y31__ |
| Y107 | dark pack | (blank) | pack_name_vs_diverge__Y107__ |
| Y32 | dark pack | (blank) | pack_name_vs_diverge__Y32__ |
| Y102 | dark pack* | (blank) | pack_name_vs_diverge__Y102__ |
| Y33 | dark pack | (blank) | pack_name_vs_diverge__Y33__ |
| Y34 | dark pack | (blank) | pack_name_vs_diverge__Y34__ |
| Y35 | dark pack | (blank) | pack_name_vs_diverge__Y35__ |
| Y36 | yehodiya trio | (blank) | pack_name_vs_diverge__Y36__ |
| Y38 | golden pack | (blank) | pack_name_vs_diverge__Y38__ |
| Y39 | golden pack | (blank) | pack_name_vs_diverge__Y39__ |
| Y40 | golden pack | (blank) | pack_name_vs_diverge__Y40__ |
| Y41 | golden pack | (blank) | pack_name_vs_diverge__Y41__ |
| Y42 | golden pack | (blank) | pack_name_vs_diverge__Y42__ |
| Y43 | golden pack | (blank) | pack_name_vs_diverge__Y43__ |
| Y44 | golden pack | (blank) | pack_name_vs_diverge__Y44__ |
| Y45 | golden pack | (blank) | pack_name_vs_diverge__Y45__ |
| Y46 | lone | (blank) | pack_name_vs_diverge__Y46__ |
| Y47 | yehodiya trio | (blank) | pack_name_vs_diverge__Y47__ |
| Y48 | yehodiya trio | (blank) | pack_name_vs_diverge__Y48__ |

*(showing first 30 of 66 rows)*

### missing 'main poligon' (in analysis pool)
11 analysed wolf(ves) have empty 'main poligon'

| serial | _id |
|---|---|
| In89 | missing_main_poligon_in_analysis_pool__In89__ |
| Mg90 | missing_main_poligon_in_analysis_pool__Mg90__ |
| In91 | missing_main_poligon_in_analysis_pool__In91__ |
| In92 | missing_main_poligon_in_analysis_pool__In92__ |
| In93 | missing_main_poligon_in_analysis_pool__In93__ |
| In94 | missing_main_poligon_in_analysis_pool__In94__ |
| In95 | missing_main_poligon_in_analysis_pool__In95__ |
| In96 | missing_main_poligon_in_analysis_pool__In96__ |
| In97 | missing_main_poligon_in_analysis_pool__In97__ |
| In98 | missing_main_poligon_in_analysis_pool__In98__ |
| In105 | missing_main_poligon_in_analysis_pool__In105__ |

### missing 'social dynamic' (in analysis pool)
12 analysed wolf(ves) have empty 'social dynamic'

| serial | _id |
|---|---|
| Y37 | missing_social_dynamic_in_analysis_pool__Y37__ |
| In89 | missing_social_dynamic_in_analysis_pool__In89__ |
| Mg90 | missing_social_dynamic_in_analysis_pool__Mg90__ |
| In91 | missing_social_dynamic_in_analysis_pool__In91__ |
| In92 | missing_social_dynamic_in_analysis_pool__In92__ |
| In93 | missing_social_dynamic_in_analysis_pool__In93__ |
| In94 | missing_social_dynamic_in_analysis_pool__In94__ |
| In95 | missing_social_dynamic_in_analysis_pool__In95__ |
| In96 | missing_social_dynamic_in_analysis_pool__In96__ |
| In97 | missing_social_dynamic_in_analysis_pool__In97__ |
| In98 | missing_social_dynamic_in_analysis_pool__In98__ |
| In105 | missing_social_dynamic_in_analysis_pool__In105__ |

### more cameras than pictures
1 wolf(ves): listed in more cameras than #pictures (worth a sanity check)

| serial | n_cameras | #pictures | _id |
|---|---|---|---|
| Sl60 | 2 | 1 | more_cameras_than_pictures__Sl60__ |

### string hygiene (whitespace / tabs)
8 cell(s) have leading/trailing whitespace, tabs or newlines

| col | serial | value | _id |
|---|---|---|---|
| cams_spotted | H13S | ' 21, 11' | string_hygiene_whitespace_tabs__H13S__cams_spotted |
| notes | Y28 | 'mostly honey ' | string_hygiene_whitespace_tabs__Y28__notes |
| notes | Y39 | 'golden fur, dark tail ' | string_hygiene_whitespace_tabs__Y39__notes |
| notes | Y43 | 'golden fur, dark tail ' | string_hygiene_whitespace_tabs__Y43__notes |
| notes | Y44 | 'golden fur, dark tail, dark-grey face, ‘wave’ pattern on the face ' | string_hygiene_whitespace_tabs__Y44__notes |
| notes | Sh52 | 'loves mud ' | string_hygiene_whitespace_tabs__Sh52__notes |
| notes | Sh54 | '”tringle” shape on the cheek ' | string_hygiene_whitespace_tabs__Sh54__notes |
| notes | In95 | 'dark orange fur ' | string_hygiene_whitespace_tabs__In95__notes |
