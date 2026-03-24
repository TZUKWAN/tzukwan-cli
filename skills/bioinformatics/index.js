/**
 * Bioinformatics Skill - Sequence analysis, scRNA-seq, variant calling, pathway analysis, database queries
 * Commands: sequence, scrna, variant, pathway, query
 *
 * Note: This skill generates code templates for bioinformatics analysis.
 * It does not use LLM chat interface as it provides deterministic code generation.
 */

import fs from 'fs';
import path from 'path';

// ─── Input Validation Utilities ──────────────────────────────────────────────

/**
 * Sanitize sequence input to prevent code injection.
 */
function sanitizeSequence(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }
  // Remove any potentially harmful characters but keep valid sequence chars
  // Valid: A-Z, a-z, 0-9, whitespace, newlines, > (FASTA header), - (gap), * (stop)
  return input.replace(/[^A-Za-z0-9\s\n\r>\-*]/g, '').slice(0, 10000);
}

/**
 * Sanitize file path to prevent directory traversal.
 */
function sanitizeFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return '';
  }
  // Remove null bytes and directory traversal patterns
  let sanitized = filePath.replace(/\0/g, '');
  sanitized = sanitized.replace(/\.\.(\/|\\)/g, '');
  // Remove shell special characters
  sanitized = sanitized.replace(/[<>&|;$`]/g, '');
  return sanitized.trim().slice(0, 255);
}

/**
 * Validate and sanitize gene list.
 */
function sanitizeGeneList(genes) {
  if (!genes) {
    return [];
  }
  if (Array.isArray(genes)) {
    return genes
      .filter(g => typeof g === 'string')
      .map(g => g.replace(/[^A-Za-z0-9\-_]/g, '').toUpperCase())
      .filter(g => g.length > 0 && g.length <= 20);
  }
  const str = String(genes);
  return str
    .split(',')
    .map(g => g.trim().replace(/[^A-Za-z0-9\-_]/g, '').toUpperCase())
    .filter(g => g.length > 0 && g.length <= 20);
}

/**
 * Validate database name against allowed list.
 */
function validateDatabase(database, allowedDbs) {
  if (!database || typeof database !== 'string') {
    return null;
  }
  const normalized = database.toLowerCase().trim();
  return allowedDbs.find(db => db.toLowerCase() === normalized) || null;
}

// ─── Code Templates ──────────────────────────────────────────────────────────

function blastTemplate(input, type) {
  const prog = type === 'protein' ? 'blastp' : 'blastn';
  const db = type === 'protein' ? 'nr' : 'nt';
  const safeInput = sanitizeSequence(input) || 'ATGCGATCGATCGATCGATCG';
  return `# NCBI BLAST — ${type} sequence search
# BioPython approach (requires internet access)
from Bio.Blast import NCBIWWW, NCBIXML
from Bio import SeqIO

sequence = """${safeInput}"""

# Submit BLAST job to NCBI
print("Submitting BLAST query to NCBI...")
result_handle = NCBIWWW.qblast(
    program="${prog}",
    database="${db}",
    sequence=sequence,
    hitlist_size=20,
    expect=0.001,
    word_size=${type === 'protein' ? 3 : 11},
    gapcosts="11 1",
)

# Parse results
blast_records = NCBIXML.parse(result_handle)
blast_record = next(blast_records)

print(f"Query: {blast_record.query}")
print(f"Database: {blast_record.database}")
print(f"Hits found: {len(blast_record.alignments)}\\n")

for alignment in blast_record.alignments[:10]:
    for hsp in alignment.hsps:
        print(f"Title:   {alignment.title[:60]}")
        print(f"Length:  {alignment.length}")
        print(f"Score:   {hsp.score}")
        print(f"E-value: {hsp.expect:.2e}")
        print(f"Identities: {hsp.identities}/{hsp.align_length} ({100*hsp.identities//hsp.align_length}%)")
        print(f"Query:   {hsp.query[:60]}")
        print(f"Match:   {hsp.match[:60]}")
        print(f"Subject: {hsp.sbjct[:60]}\\n")

# ─── Command-line BLAST (local installation) ──────────────────────
# blastn -query query.fasta -db nt -out results.txt -num_alignments 20 -evalue 0.001
# blastp -query protein.fasta -db nr -out results.txt -evalue 0.001 -outfmt 6
`;
}

function alignTemplate(input) {
  const safeInput = sanitizeSequence(input) || '>seq1\nATGCGATCGATCGATCG\n>seq2\nATGCGATCGATCTATCG\n>seq3\nATGCGATCGATCGATCC';
  return `# Multiple Sequence Alignment using BioPython + ClustalW/MUSCLE
from Bio import SeqIO, AlignIO
from Bio.Align.Applications import ClustalwCommandline, MuscleCommandline
from Bio.Align import MultipleSeqAlignment
import subprocess

# ─── Option 1: Using MUSCLE (recommended) ──────────────────────────
sequences_fasta = """${safeInput}"""

with open('input.fasta', 'w') as f:
    f.write(sequences_fasta)

muscle_cmd = MuscleCommandline(input="input.fasta", out="aligned.fasta", diags=True, maxiters=16)
stdout, stderr = muscle_cmd()

# Load and display alignment
alignment = AlignIO.read("aligned.fasta", "fasta")
print(f"Alignment: {alignment.get_alignment_length()} columns, {len(alignment)} sequences")
for record in alignment:
    print(f"{record.id:20s}  {str(record.seq)[:60]}")

# ─── Option 2: ClustalW ────────────────────────────────────────────
clustalw_cmd = ClustalwCommandline("clustalw2", infile="input.fasta", outfile="aligned_clustal.aln")
# stdout, stderr = clustalw_cmd()

# ─── Calculate pairwise identity ───────────────────────────────────
def pairwise_identity(seq1, seq2):
    matches = sum(a == b and a != '-' for a, b in zip(str(seq1), str(seq2)))
    length = min(sum(c != '-' for c in str(seq1)), sum(c != '-' for c in str(seq2)))
    return matches / length if length > 0 else 0

for i, rec1 in enumerate(alignment):
    for j, rec2 in enumerate(alignment):
        if i < j:
            pid = pairwise_identity(rec1.seq, rec2.seq)
            print(f"{rec1.id} vs {rec2.id}: {pid:.1%} identity")
`;
}

function featuresTemplate(input, type) {
  const safeInput = sanitizeSequence(input) || 'ATGCGATCGATCGATCGATCGATCGATCGATCGATCGATCG';
  const safeType = ['nucleotide', 'dna', 'rna', 'protein'].includes(type) ? type : 'nucleotide';
  return `# Sequence Feature Analysis using BioPython
from Bio import SeqIO
from Bio.SeqUtils import gc_fraction
from Bio.SeqUtils.ProtParam import ProteinAnalysis
from Bio.Seq import Seq
import re

sequence = Seq("${safeInput}")
seq_type = "${safeType}"

print(f"Sequence: {str(sequence)[:60]}...")
print(f"Length: {len(sequence)} nt\\n")

if seq_type in ('nucleotide', 'dna', 'rna'):
    # ─── Nucleotide Features ──────────────────────────────────────
    gc = gc_fraction(sequence)
    print(f"GC content: {gc:.1%}")

    # ORF prediction
    print("\\n─── Open Reading Frames (ORFs) ───")
    for strand, nuc in [(1, sequence), (-1, sequence.reverse_complement())]:
        for frame in range(3):
            trans = nuc[frame:].translate()
            aa_seq = str(trans)
            for match in re.finditer(r'M[^*]{30,}', aa_seq):
                start = frame + match.start() * 3
                end = frame + match.end() * 3
                print(f"  Strand {strand:+d}, Frame {frame+1}: pos {start}-{end}, len={len(match.group())} aa")

    # CpG islands (simplified)
    cpg_count = str(sequence).count('CG')
    print(f"\\nCpG dinucleotides: {cpg_count}")
    print(f"CpG ratio: {cpg_count / (len(sequence)/2):.3f} (>0.6 suggests CpG island)")

elif seq_type == 'protein':
    # ─── Protein Features ─────────────────────────────────────────
    prot = ProteinAnalysis(str(sequence))
    print(f"Molecular weight: {prot.molecular_weight():.1f} Da")
    print(f"Isoelectric point: {prot.isoelectric_point():.2f}")
    print(f"Instability index: {prot.instability_index():.1f}")
    print(f"GRAVY (hydrophobicity): {prot.gravy():.3f}")

    aa_counts = prot.count_amino_acids()
    print("\\nAmino acid composition (top 5):")
    for aa, cnt in sorted(aa_counts.items(), key=lambda x: -x[1])[:5]:
        print(f"  {aa}: {cnt} ({100*cnt/len(sequence):.1f}%)")
`;
}

function scrnaTemplate(inputFormat, steps, outputDir) {
  const validSteps = ['qc', 'normalize', 'reduce', 'cluster', 'deg'];
  const analysisSteps = Array.isArray(steps)
    ? steps.filter(s => validSteps.includes(s))
    : ['qc', 'normalize', 'reduce', 'cluster', 'deg'];
  const safeOutputDir = sanitizeFilePath(outputDir) || './scrna-output';
  const safeInputFormat = ['10x', '10x_mtx', 'h5ad', 'csv'].includes(inputFormat) ? inputFormat : '10x';

  return `# Single-Cell RNA-seq Analysis Pipeline
# Framework: Scanpy (Python)
# Input format: ${inputFormat}

import scanpy as sc
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import os

sc.settings.verbosity = 3
sc.settings.figdir = "${safeOutputDir}/figures/"
os.makedirs("${safeOutputDir}/figures", exist_ok=True)

# ─── 1. Load Data ─────────────────────────────────────────────────
${safeInputFormat === '10x' || safeInputFormat === '10x_mtx'
  ? `adata = sc.read_10x_mtx(
    'data/filtered_feature_bc_matrix/',
    var_names='gene_symbols',
    cache=True,
)`
  : safeInputFormat === 'h5ad'
  ? `adata = sc.read_h5ad('data/input.h5ad')`
  : safeInputFormat === 'csv'
  ? `counts = pd.read_csv('data/counts.csv', index_col=0)
adata = sc.AnnData(counts.T)`
  : `adata = sc.read_10x_mtx('data/filtered_feature_bc_matrix/', var_names='gene_symbols')`
}

adata.var_names_make_unique()
print(f"Loaded: {adata.n_obs} cells × {adata.n_vars} genes")

${analysisSteps.includes('qc') ? `
# ─── 2. Quality Control ───────────────────────────────────────────
adata.var['mt'] = adata.var_names.str.startswith('MT-')  # human mitochondrial
sc.pp.calculate_qc_metrics(adata, qc_vars=['mt'], percent_top=None, log1p=False, inplace=True)

# Visualize QC metrics
sc.pl.violin(adata, ['n_genes_by_counts', 'total_counts', 'pct_counts_mt'],
             jitter=0.4, multi_panel=True, save='_qc_metrics.pdf')

# Filter cells and genes
adata = adata[adata.obs.n_genes_by_counts > 200, :]
adata = adata[adata.obs.n_genes_by_counts < 5000, :]
adata = adata[adata.obs.pct_counts_mt < 20, :]
sc.pp.filter_genes(adata, min_cells=3)
print(f"After QC: {adata.n_obs} cells × {adata.n_vars} genes")
` : ''}

${analysisSteps.includes('normalize') ? `
# ─── 3. Normalization & Log Transform ────────────────────────────
sc.pp.normalize_total(adata, target_sum=1e4)
sc.pp.log1p(adata)
adata.raw = adata  # Save raw counts

# Highly variable genes
sc.pp.highly_variable_genes(adata, min_mean=0.0125, max_mean=3, min_disp=0.5)
print(f"Highly variable genes: {adata.var.highly_variable.sum()}")
adata = adata[:, adata.var.highly_variable]

# Scale
sc.pp.scale(adata, max_value=10)
` : ''}

${analysisSteps.includes('reduce') ? `
# ─── 4. Dimensionality Reduction ─────────────────────────────────
sc.tl.pca(adata, svd_solver='arpack', n_comps=50)
sc.pl.pca_variance_ratio(adata, log=True, save='_pca_variance.pdf')

# Neighborhood graph
sc.pp.neighbors(adata, n_neighbors=15, n_pcs=40)

# UMAP
sc.tl.umap(adata, spread=1.0, min_dist=0.5)
sc.pl.umap(adata, save='_umap_initial.pdf')
` : ''}

${analysisSteps.includes('cluster') ? `
# ─── 5. Clustering ────────────────────────────────────────────────
sc.tl.leiden(adata, resolution=0.5)
sc.pl.umap(adata, color=['leiden'], save='_umap_leiden.pdf', legend_loc='on data')
print(f"Clusters: {adata.obs['leiden'].nunique()}")
` : ''}

${analysisSteps.includes('deg') ? `
# ─── 6. Differential Expression ──────────────────────────────────
sc.tl.rank_genes_groups(adata, 'leiden', method='wilcoxon', n_genes=50)
sc.pl.rank_genes_groups(adata, n_genes=20, sharey=False, save='_marker_genes.pdf')

# Export results
deg_results = sc.get.rank_genes_groups_df(adata, group=None)
deg_results.to_csv("${safeOutputDir}/deg_results.csv", index=False)
print("Top marker genes per cluster:")
for cluster in adata.obs['leiden'].unique():
    genes = sc.get.rank_genes_groups_df(adata, group=cluster).head(5)['names'].tolist()
    print(f"  Cluster {cluster}: {', '.join(genes)}")
` : ''}

# ─── 7. Save Results ──────────────────────────────────────────────
adata.write("${safeOutputDir}/adata_processed.h5ad")
print(f"\\nAnalysis complete. Results saved to ${safeOutputDir}/")
print(f"  - Processed AnnData: ${safeOutputDir}/adata_processed.h5ad")
print(f"  - Figures: ${safeOutputDir}/figures/")
`;
}

function variantTemplate(vcfFile, pipeline) {
  const safeVcfFile = sanitizeFilePath(vcfFile) || 'variants.vcf';
  const safePipeline = ['basic', 'extended'].includes(pipeline) ? pipeline : 'basic';
  return `# Variant Analysis Pipeline
# Tool: Python + cyvcf2/pysam + Ensembl VEP annotation
# Pipeline: ${safePipeline}

import subprocess
import pandas as pd
from pathlib import Path

vcf_file = "${safeVcfFile}"
output_dir = "./variant_output"
Path(output_dir).mkdir(exist_ok=True)

# ─── Step 1: Basic VCF Statistics ─────────────────────────────────
print("=== VCF Statistics ===")
# Using bcftools
subprocess.run(f"bcftools stats {vcf_file} | grep '^SN'", shell=True)

# ─── Step 2: Quality Filtering ────────────────────────────────────
filtered_vcf = f"{output_dir}/filtered.vcf.gz"
subprocess.run(f"""
bcftools filter \\
  --include 'QUAL > 30 && DP > 10 && MAF > 0.01' \\
  --output {filtered_vcf} \\
  --output-type z \\
  {vcf_file}
""", shell=True)
subprocess.run(f"bcftools index {filtered_vcf}", shell=True)

# ─── Step 3: Annotation with Ensembl VEP ──────────────────────────
annotated_vcf = f"{output_dir}/annotated.vcf"
subprocess.run(f"""
vep \\
  --input_file {filtered_vcf} \\
  --output_file {annotated_vcf} \\
  --format vcf \\
  --vcf \\
  --everything \\
  --fork 4 \\
  --cache \\
  --species homo_sapiens \\
  --assembly GRCh38 \\
  --plugin CADD,snv=whole_genome_SNVs.tsv.gz \\
  --plugin dbNSFP,dbNSFP4.4a_grch38.gz,SIFT_pred,Polyphen2_HDIV_pred,MutationAssessor_pred
""", shell=True)

# ─── Step 4: Parse Annotations ────────────────────────────────────
def parse_vep_vcf(vcf_path):
    """Parse VEP-annotated VCF into a DataFrame"""
    records = []
    with open(vcf_path) as f:
        csq_fields = []
        for line in f:
            if line.startswith('##INFO=<ID=CSQ'):
                # Extract CSQ field names
                desc = line.split('Format: ')[1].rstrip('">\n')
                csq_fields = desc.split('|')
            elif not line.startswith('#'):
                parts = line.strip().split('\\t')
                if len(parts) >= 8:
                    chrom, pos, vid, ref, alt = parts[:5]
                    info = dict(f.split('=') for f in parts[7].split(';') if '=' in f)
                    if 'CSQ' in info and csq_fields:
                        for csq in info['CSQ'].split(','):
                            vals = csq.split('|')
                            record = {'CHROM': chrom, 'POS': pos, 'REF': ref, 'ALT': alt}
                            record.update(dict(zip(csq_fields, vals)))
                            records.append(record)
    return pd.DataFrame(records)

df = parse_vep_vcf(annotated_vcf)
df.to_csv(f"{output_dir}/annotated_variants.tsv", sep='\\t', index=False)
print(f"Annotated variants saved: {output_dir}/annotated_variants.tsv")

# ─── Step 5: Pathogenicity Prioritization ─────────────────────────
if 'Consequence' in df.columns:
    high_impact = df[df['IMPACT'] == 'HIGH']
    print(f"\\nHigh-impact variants: {len(high_impact)}")
    if len(high_impact) > 0:
        print(high_impact[['CHROM','POS','REF','ALT','Consequence','SYMBOL','SIFT_pred']].head(20).to_string())
`;
}

function pathwayTemplate(genes, organism, database) {
  const safeGeneList = sanitizeGeneList(genes);
  const safeOrganism = ['human', 'mouse', 'rat', 'fly', 'yeast'].includes(organism) ? organism : 'human';
  const safeDatabase = validateDatabase(database, ['kegg', 'go', 'reactome']) || 'kegg';
  const geneListStr = safeGeneList.join(',');

  return `# Pathway Enrichment Analysis
# Database: ${safeDatabase} | Organism: ${safeOrganism}

import requests
import pandas as pd
import json

genes = "${geneListStr}".split(',')
organism = "${safeOrganism}"
database = "${safeDatabase}"

print(f"Analyzing {len(genes)} genes: {', '.join(genes[:5])}{'...' if len(genes)>5 else ''}")

${safeDatabase === 'kegg' ? `
# ─── KEGG Pathway Analysis ────────────────────────────────────────
# Using KEGG REST API
org_code = 'hsa' if organism == 'human' else 'mmu' if organism == 'mouse' else organism

# Convert gene symbols to KEGG IDs
def get_kegg_gene_ids(gene_symbols, org='hsa'):
    kegg_ids = []
    for symbol in gene_symbols:
        url = f"https://rest.kegg.jp/find/genes/{symbol}"
        r = requests.get(url, timeout=10)
        if r.ok:
            for line in r.text.strip().split('\\n'):
                if line.startswith(org + ':'):
                    kegg_ids.append(line.split('\\t')[0])
                    break
    return kegg_ids

print("Fetching KEGG pathway data...")
kegg_ids = get_kegg_gene_ids(genes[:10], org_code)  # limit for demo

pathway_results = []
for kid in kegg_ids[:5]:
    url = f"https://rest.kegg.jp/get/{kid}/pathway"
    r = requests.get(url, timeout=10)
    if r.ok:
        for line in r.text.strip().split('\\n'):
            if line.startswith('PATHWAY'):
                pathway_results.append({'gene': kid, 'pathway': line.replace('PATHWAY','').strip()})

df = pd.DataFrame(pathway_results)
print("\\nKEGG Pathways enriched:")
print(df.to_string(index=False) if len(df) > 0 else "  No results (check gene symbols for this organism)")

# ─── Visualize with gseapy (if installed) ──────────────────────────
try:
    import gseapy as gp
    enr = gp.enrichr(
        gene_list=genes,
        gene_sets='KEGG_2021_Human',
        organism='Human',
        outdir='./pathway_results',
    )
    print("\\nTop enriched pathways:")
    print(enr.results.head(10)[['Term','Overlap','P-value','Adjusted P-value']].to_string())
except ImportError:
    print("\\nInstall gseapy for automated enrichment: pip install gseapy")
` : safeDatabase === 'go' ? `
# ─── Gene Ontology (GO) Enrichment ────────────────────────────────
try:
    import gseapy as gp
    # Biological Process
    bp = gp.enrichr(gene_list=genes, gene_sets='GO_Biological_Process_2023',
                    organism='Human', outdir='./go_results/bp')
    # Molecular Function
    mf = gp.enrichr(gene_list=genes, gene_sets='GO_Molecular_Function_2023',
                    organism='Human', outdir='./go_results/mf')
    print("\\nTop GO Biological Processes:")
    print(bp.results.head(10)[['Term','Overlap','P-value','Adjusted P-value']].to_string())
    print("\\nTop GO Molecular Functions:")
    print(mf.results.head(10)[['Term','Overlap','P-value','Adjusted P-value']].to_string())
except ImportError:
    print("Install gseapy: pip install gseapy")
    # Manual GO query via QuickGO API
    gene_ids = ','.join(genes[:10])
    url = f"https://www.ebi.ac.uk/QuickGO/services/annotation/search?geneProductId={gene_ids}&limit=25"
    r = requests.get(url, headers={'Accept':'application/json'}, timeout=15)
    if r.ok:
        data = r.json()
        for result in data.get('results', [])[:5]:
            print(f"  {result.get('goId','')}: {result.get('goName','')}")
` : `
# ─── Reactome Pathway Analysis ────────────────────────────────────
# Using Reactome REST API
url = "https://reactome.org/AnalysisService/identifiers/projection"
params = {'interactors': 'false', 'pageSize': 20, 'page': 1,
          'sortBy': 'ENTITIES_PVALUE', 'order': 'ASC',
          'resource': 'TOTAL', 'pValue': 0.05}
headers = {'Content-Type': 'text/plain', 'Accept': 'application/json'}
payload = '\\n'.join(genes)

r = requests.post(url, params=params, data=payload, headers=headers, timeout=30)
if r.ok:
    data = r.json()
    pathways = data.get('pathways', [])
    print(f"\\nReactome: {len(pathways)} enriched pathways found")
    for pw in pathways[:10]:
        print(f"  {pw['stId']}: {pw['name']} (p={pw['entities']['pValue']:.3e}, FDR={pw['entities']['fdr']:.3e})")
else:
    print(f"Reactome API error: {r.status_code}")
`}
`;
}

function queryTemplate(database, queryStr, limit) {
  const safeDb = validateDatabase(database, ['ncbi', 'uniprot', 'pdb', 'ensembl']);
  const parsedLimit = parseInt(limit, 10);
  const safeLimit = Math.min(Math.max(1, isNaN(parsedLimit) ? 10 : parsedLimit), 100);
  // Sanitize query string - remove quotes that could break the template
  const safeQuery = String(queryStr || '').replace(/["\']/g, '').slice(0, 200);

  if (safeDb === 'ncbi') {
    return `# NCBI Query via Entrez (BioPython)
from Bio import Entrez
Entrez.email = "your.email@example.com"  # Required by NCBI

query = "${safeQuery}"
database = "gene"  # Options: gene, protein, nucleotide, pubmed, sra

# Search
handle = Entrez.esearch(db=database, term=query, retmax=${safeLimit})
record = Entrez.read(handle)
handle.close()

print(f"Total hits: {record['Count']}")
ids = record['IdList'][:${safeLimit}]
print(f"Fetching {len(ids)} records...")

# Fetch details
fetch_handle = Entrez.efetch(db=database, id=','.join(ids), rettype='gb', retmode='text')
data = fetch_handle.read()
fetch_handle.close()

# Parse (for gene database use XML)
fetch_handle2 = Entrez.efetch(db=database, id=','.join(ids[:5]), rettype='xml', retmode='xml')
records = Entrez.read(fetch_handle2)
fetch_handle2.close()

for rec in records[:5]:
    print(f"  ID: {rec.get('Id','?')}  Name: {rec.get('Name','?')}  Org: {rec.get('Organism',{}).get('ScientificName','?')}")

# ─── Shortcuts ────────────────────────────────────────────────────
# Search PubMed: Entrez.esearch(db='pubmed', term='BRCA1 AND cancer', retmax=10)
# Search protein: Entrez.esearch(db='protein', term='insulin AND homo sapiens', retmax=10)
`;
  }

  if (safeDb === 'uniprot') {
    return `# UniProt REST API Query
import requests

query = "${safeQuery}"
url = "https://rest.uniprot.org/uniprotkb/search"
params = {
    'query': query,
    'format': 'json',
    'size': ${safeLimit},
    'fields': 'accession,id,protein_name,gene_names,organism_name,length,sequence,function_comment',
}

response = requests.get(url, params=params, timeout=30)
if response.ok:
    data = response.json()
    results = data.get('results', [])
    print(f"UniProt results for '{query}': {len(results)} entries\\n")
    for entry in results[:${safeLimit}]:
        acc = entry.get('primaryAccession', '?')
        name = entry.get('proteinDescription', {}).get('recommendedName', {}).get('fullName', {}).get('value', '?')
        gene = ','.join([g['geneName']['value'] for g in entry.get('genes', [])[:2] if 'geneName' in g])
        org = entry.get('organism', {}).get('scientificName', '?')
        length = entry.get('sequence', {}).get('length', '?')
        print(f"  {acc}  {name[:50]}  Gene={gene}  Org={org}  Len={length}aa")
        print(f"         https://www.uniprot.org/uniprotkb/{acc}")
else:
    print(f"UniProt query failed: {response.status_code} {response.text[:200]}")
`;
  }

  if (safeDb === 'pdb') {
    return `# RCSB PDB Query
import requests

query = "${safeQuery}"
url = "https://search.rcsb.org/rcsbsearch/v2/query"

payload = {
    "query": {
        "type": "terminal",
        "service": "full_text",
        "parameters": {"value": query}
    },
    "return_type": "entry",
    "request_options": {
        "paginate": {"start": 0, "rows": ${safeLimit}},
        "sort": [{"sort_by": "score", "direction": "desc"}]
    }
}

response = requests.post(url, json=payload, timeout=30)
if response.ok:
    data = response.json()
    total = data.get('total_count', 0)
    ids = [r['identifier'] for r in data.get('result_set', [])]
    print(f"PDB search '{query}': {total} total hits, showing {len(ids)}\\n")

    # Fetch structure details
    for pdb_id in ids[:${Math.min(safeLimit, 10)}]:
        detail_url = f"https://data.rcsb.org/rest/v1/core/entry/{pdb_id}"
        dr = requests.get(detail_url, timeout=10)
        if dr.ok:
            d = dr.json()
            title = d.get('struct', {}).get('title', '?')
            method = d.get('exptl', [{}])[0].get('method', '?')
            resolution = d.get('rcsb_entry_info', {}).get('resolution_combined', ['?'])[0]
            print(f"  {pdb_id}: {title[:60]}")
            print(f"         Method={method}  Resolution={resolution}Å  https://www.rcsb.org/structure/{pdb_id}")
else:
    print(f"PDB query error: {response.status_code}")
`;
  }

  if (safeDb === 'ensembl') {
    return `# Ensembl REST API Query
import requests

query = "${safeQuery}"
server = "https://rest.ensembl.org"
headers = {"Content-Type": "application/json", "Accept": "application/json"}

# Gene lookup by symbol
url = f"{server}/lookup/symbol/homo_sapiens/{query}"
r = requests.get(url, headers=headers, timeout=20)
if r.ok:
    gene = r.json()
    print(f"Gene: {gene.get('display_name','?')} ({gene.get('id','?')})")
    print(f"  Biotype:  {gene.get('biotype','?')}")
    print(f"  Location: {gene.get('seq_region_name','?')}:{gene.get('start','?')}-{gene.get('end','?')} (strand {gene.get('strand','?')})")
    print(f"  Assembly: {gene.get('assembly_name','?')}")
    print(f"  Description: {gene.get('description','?')}")

    # Fetch transcripts
    tx_url = f"{server}/lookup/id/{gene['id']}?expand=1"
    tr = requests.get(tx_url, headers=headers, timeout=20)
    if tr.ok:
        tx_data = tr.json()
        transcripts = tx_data.get('Transcript', [])
        print(f"\\nTranscripts ({len(transcripts)}):")
        for tx in transcripts[:5]:
            print(f"  {tx.get('id','?')}  {tx.get('biotype','?')}  len={tx.get('length','?')}nt  canonical={tx.get('is_canonical','?')}")
else:
    # Try cross-reference search
    xref_url = f"{server}/xrefs/symbol/homo_sapiens/{query}"
    xr = requests.get(xref_url, headers=headers, timeout=20)
    if xr.ok:
        for hit in xr.json()[:${limit}]:
            print(f"  {hit.get('type','?')}  {hit.get('id','?')}  {hit.get('display_id','?')}")
    else:
        print(f"Ensembl lookup failed for '{query}': {r.status_code}")
`;
  }

  // Return null for unsupported database
  return null;
}

// ─── Command Implementations ─────────────────────────────────────────────────

async function sequenceCommand(args, context) {
  const { input = '', type = 'nucleotide', task = 'blast' } = args;

  const validTasks = ['blast', 'align', 'features'];
  if (!validTasks.includes(task)) {
    return { error: `Unknown task "${task}". Supported: ${validTasks.join(', ')}` };
  }

  let code = '';
  let description = '';

  if (task === 'blast') {
    code = blastTemplate(input, type);
    description = `NCBI BLAST query for ${type} sequence (${input ? input.slice(0,20)+'...' : 'user-provided'})`;
  } else if (task === 'align') {
    code = alignTemplate(input);
    description = 'Multiple sequence alignment with MUSCLE/ClustalW';
  } else {
    code = featuresTemplate(input, type);
    description = `Sequence feature analysis for ${type} sequence`;
  }

  return {
    task,
    type,
    inputLength: input.length,
    code,
    description,
    output: `${description}\n\nTool requirements:\n  pip install biopython\n  # For BLAST: also requires internet (NCBI API)\n  # For align: also install MUSCLE: conda install -c bioconda muscle\n  # For features: pip install biopython only\n\nCode ready. Replace placeholder sequences with your actual input.`,
  };
}

async function scrnaCommand(args, context) {
  const { inputFormat = '10x', steps, outputDir = './scrna-output' } = args;

  const validFormats = ['10x', '10x_mtx', 'h5ad', 'csv'];
  if (!validFormats.includes(inputFormat)) {
    return { error: `Unknown inputFormat "${inputFormat}". Supported: ${validFormats.join(', ')}` };
  }

  // Validate steps if provided
  const validSteps = ['qc', 'normalize', 'reduce', 'cluster', 'deg'];
  let safeSteps = ['qc', 'normalize', 'reduce', 'cluster', 'deg'];
  if (steps) {
    if (Array.isArray(steps)) {
      safeSteps = steps.filter(s => validSteps.includes(s));
      if (safeSteps.length === 0) {
        return { error: `No valid steps provided. Supported: ${validSteps.join(', ')}` };
      }
    } else {
      return { error: `Steps must be an array. Supported: ${validSteps.join(', ')}` };
    }
  }

  const safeOutputDir = sanitizeFilePath(outputDir) || './scrna-output';
  const code = scrnaTemplate(inputFormat, safeSteps, safeOutputDir);

  return {
    inputFormat,
    steps: safeSteps,
    outputDir: safeOutputDir,
    code,
    output: `scRNA-seq analysis pipeline (${inputFormat} format)\nSteps: ${safeSteps.join(' → ')}\nOutput: ${safeOutputDir}/\n\nInstall: pip install scanpy anndata matplotlib seaborn`,
  };
}

async function variantCommand(args, context) {
  const { vcfFile, pipeline = 'basic' } = args;

  // Validate pipeline parameter
  const validPipelines = ['basic', 'extended'];
  const safePipeline = validPipelines.includes(pipeline) ? pipeline : 'basic';

  // Sanitize vcf file path
  const safeVcfFile = sanitizeFilePath(vcfFile) || 'variants.vcf';

  const code = variantTemplate(safeVcfFile, safePipeline);

  return {
    vcfFile: safeVcfFile,
    pipeline: safePipeline,
    code,
    output: `Variant analysis pipeline (${safePipeline})\n\nSteps:\n  1. VCF statistics (bcftools)\n  2. Quality filtering (QUAL>30, DP>10)\n  3. Annotation with Ensembl VEP\n  4. Pathogenicity prioritization\n\nInstall: conda install -c bioconda bcftools ensembl-vep\npip install pandas cyvcf2`,
  };
}

async function pathwayCommand(args, context) {
  const { genes, organism = 'human', database = 'kegg' } = args;

  if (!genes) {
    return { error: 'genes argument is required (comma-separated list or array)' };
  }

  const validDbs = ['kegg', 'go', 'reactome'];
  const safeDatabase = validateDatabase(database, validDbs);
  if (!safeDatabase) {
    return { error: `Unknown database "${database}". Supported: ${validDbs.join(', ')}` };
  }

  // Validate and sanitize gene list
  const safeGeneList = sanitizeGeneList(genes);
  if (safeGeneList.length === 0) {
    return { error: 'No valid genes provided. Gene symbols should be alphanumeric.' };
  }

  // Validate organism
  const validOrganisms = ['human', 'mouse', 'rat', 'fly', 'yeast'];
  const safeOrganism = validOrganisms.includes(organism) ? organism : 'human';

  const code = pathwayTemplate(safeGeneList, safeOrganism, safeDatabase);

  return {
    genes: safeGeneList,
    organism: safeOrganism,
    database: safeDatabase,
    code,
    output: `Pathway enrichment analysis\nDatabase: ${safeDatabase} | Organism: ${safeOrganism}\nGenes (${safeGeneList.length}): ${safeGeneList.slice(0,5).join(', ')}${safeGeneList.length > 5 ? '...' : ''}\n\nInstall: pip install gseapy requests pandas\n# For KEGG: pip install gseapy (includes KEGG support)`,
  };
}

async function queryCommand(args, context) {
  const { database, query, limit = 10 } = args;

  if (!database) {
    return { error: 'database argument is required. Supported: ncbi, uniprot, pdb, ensembl' };
  }
  if (!query) {
    return { error: 'query argument is required' };
  }

  const validDbs = ['ncbi', 'uniprot', 'pdb', 'ensembl'];
  const safeDatabase = validateDatabase(database, validDbs);
  if (!safeDatabase) {
    return { error: `Unknown database "${database}". Supported: ${validDbs.join(', ')}` };
  }

  // Validate and sanitize limit
  const parsedLimit = parseInt(limit, 10);
  const safeLimit = Math.min(Math.max(1, isNaN(parsedLimit) ? 10 : parsedLimit), 100);

  const code = queryTemplate(safeDatabase, query, safeLimit);

  if (!code) {
    return { error: `Failed to generate query template for ${safeDatabase}` };
  }

  return {
    database: safeDatabase,
    query: String(query).slice(0, 200),
    limit: safeLimit,
    code,
    output: `Database query template: ${safeDatabase.toUpperCase()}\nQuery: "${String(query).slice(0, 50)}${query.length > 50 ? '...' : ''}" | Limit: ${safeLimit}\n\nInstall: pip install requests biopython\n\nCopy and run the code snippet. Replace email (for NCBI Entrez) with your own.`,
  };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export const commands = [
  {
    name: 'sequence',
    description: 'Sequence analysis: BLAST search, multiple alignment, or feature extraction',
    args: [
      { name: 'input', type: 'string', description: 'Input sequence (FASTA or raw sequence)' },
      { name: 'type', type: 'string', default: 'nucleotide', description: 'Sequence type: nucleotide, protein' },
      { name: 'task', type: 'string', default: 'blast', description: 'Task: blast, align, features' },
    ],
    execute: sequenceCommand,
  },
  {
    name: 'scrna',
    description: 'Generate single-cell RNA-seq analysis pipeline code (Scanpy)',
    args: [
      { name: 'inputFormat', type: 'string', default: '10x', description: 'Input format: 10x, h5ad, csv' },
      { name: 'steps', type: 'array', description: 'Analysis steps: qc, normalize, reduce, cluster, deg' },
      { name: 'outputDir', type: 'string', default: './scrna-output', description: 'Output directory' },
    ],
    execute: scrnaCommand,
  },
  {
    name: 'variant',
    description: 'Generate variant analysis pipeline (VCF filtering + VEP annotation)',
    args: [
      { name: 'vcfFile', type: 'string', description: 'Path to VCF file' },
      { name: 'pipeline', type: 'string', default: 'basic', description: 'Pipeline type: basic, extended' },
    ],
    execute: variantCommand,
  },
  {
    name: 'pathway',
    description: 'Generate pathway enrichment analysis code (KEGG/GO/Reactome)',
    args: [
      { name: 'genes', type: 'string', required: true, description: 'Comma-separated gene list or array' },
      { name: 'organism', type: 'string', default: 'human', description: 'Organism: human, mouse' },
      { name: 'database', type: 'string', default: 'kegg', description: 'Database: kegg, go, reactome' },
    ],
    execute: pathwayCommand,
  },
  {
    name: 'query',
    description: 'Generate database query code for NCBI, UniProt, PDB, or Ensembl',
    args: [
      { name: 'database', type: 'string', required: true, description: 'Database: ncbi, uniprot, pdb, ensembl' },
      { name: 'query', type: 'string', required: true, description: 'Search query (gene name, protein, etc.)' },
      { name: 'limit', type: 'number', default: 10, description: 'Maximum results to return' },
    ],
    execute: queryCommand,
  },
];

export default { commands };
