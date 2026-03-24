/**
 * Dataset Hub Skill - Search and discover research datasets
 * Built-in catalogue of 100+ real datasets across 10 fields
 */

// ============================================================================
// DATASET CATALOGUE - 100+ Real Datasets Across 10 Fields
// ============================================================================

const DATASET_CATALOGUE = [
  // ==========================================================================
  // AI/ML - Machine Learning Benchmarks and Datasets
  // ==========================================================================
  {
    name: "MNIST",
    description: "Handwritten digits dataset with 70,000 grayscale images of size 28x28, widely used for training and testing in machine learning",
    category: "AI/ML",
    url: "https://yann.lecun.com/exdb/mnist/",
    format: "IDX",
    license: "Public Domain",
    tasks: ["image classification", "computer vision", "benchmarking"],
    size: "70,000 images",
    features: ["28x28 grayscale images", "10 digit classes", "60k train / 10k test split"],
    citation: "LeCun, Y., Bottou, L., Bengio, Y., & Haffner, P. (1998). Gradient-based learning applied to document recognition. Proceedings of the IEEE, 86(11), 2278-2324."
  },
  {
    name: "CIFAR-10",
    description: "60,000 32x32 color images in 10 classes, with 6,000 images per class",
    category: "AI/ML",
    url: "https://www.cs.toronto.edu/~kriz/cifar.html",
    format: "Python pickled",
    license: "MIT",
    tasks: ["image classification", "computer vision", "deep learning"],
    size: "60,000 images",
    features: ["32x32 RGB images", "10 object classes", "50k train / 10k test"],
    citation: "Krizhevsky, A., & Hinton, G. (2009). Learning multiple layers of features from tiny images. Technical report, University of Toronto."
  },
  {
    name: "CIFAR-100",
    description: "100 classes grouped into 20 superclasses, 600 images per class",
    category: "AI/ML",
    url: "https://www.cs.toronto.edu/~kriz/cifar.html",
    format: "Python pickled",
    license: "MIT",
    tasks: ["fine-grained classification", "computer vision", "hierarchical classification"],
    size: "60,000 images",
    features: ["32x32 RGB images", "100 fine classes + 20 coarse classes", "500 train / 100 test per class"],
    citation: "Krizhevsky, A., & Hinton, G. (2009). Learning multiple layers of features from tiny images. Technical report, University of Toronto."
  },
  {
    name: "ImageNet",
    description: "Large-scale visual recognition dataset with 1000+ object categories and 14M+ images",
    category: "AI/ML",
    url: "https://www.image-net.org/",
    format: "JPEG, XML",
    license: "Research Use",
    tasks: ["image classification", "object detection", "transfer learning", "computer vision"],
    size: "14M+ images",
    features: ["1000+ object categories", "Bounding box annotations", "Hierarchical WordNet structure"],
    citation: "Deng, J., Dong, W., Socher, R., Li, L. J., Li, K., & Fei-Fei, L. (2009). ImageNet: A large-scale hierarchical image database. CVPR 2009."
  },
  {
    name: "Fashion-MNIST",
    description: "Zalando's article images consisting of 70,000 fashion products in 10 categories",
    category: "AI/ML",
    url: "https://github.com/zalandoresearch/fashion-mnist",
    format: "IDX",
    license: "MIT",
    tasks: ["image classification", "benchmarking", "fashion AI"],
    size: "70,000 images",
    features: ["28x28 grayscale", "10 fashion categories", "Direct MNIST drop-in replacement"],
    citation: "Xiao, H., Rasul, K., & Vollgraf, R. (2017). Fashion-MNIST: a Novel Image Dataset for Benchmarking Machine Learning Algorithms. arXiv:1708.07747."
  },
  {
    name: "Kaggle Titanic",
    description: "Passenger survival data from the Titanic disaster, classic machine learning competition dataset",
    category: "AI/ML",
    url: "https://www.kaggle.com/competitions/titanic",
    format: "CSV",
    license: "CC0",
    tasks: ["binary classification", "tabular data", "feature engineering", "beginner ML"],
    size: "891 train + 418 test samples",
    features: ["Passenger demographics", "Ticket class", "Survival outcome", "Missing data handling"],
    citation: "Kaggle. (2012). Titanic - Machine Learning from Disaster. Retrieved from https://www.kaggle.com/competitions/titanic"
  },
  {
    name: "California Housing",
    description: "California census tract housing data for regression tasks",
    category: "AI/ML",
    url: "https://scikit-learn.org/stable/modules/generated/sklearn.datasets.fetch_california_housing.html",
    format: "CSV",
    license: "BSD",
    tasks: ["regression", "tabular data", "price prediction"],
    size: "20,640 samples",
    features: ["8 numeric features", "Median house value target", "Geographic features"],
    citation: "Pace, R. K., & Barry, R. (1997). Sparse spatial autoregressions. Statistics & Probability Letters, 33(3), 291-297."
  },
  {
    name: "Boston Housing",
    description: "Housing data for Boston suburbs with 13 features for regression",
    category: "AI/ML",
    url: "https://scikit-learn.org/stable/modules/generated/sklearn.datasets.load_boston.html",
    format: "CSV",
    license: "BSD",
    tasks: ["regression", "tabular data", "feature selection"],
    size: "506 samples",
    features: ["13 features", "Crime rate", "Property tax", "Pupil-teacher ratio"],
    citation: "Harrison, D., & Rubinfeld, D. L. (1978). Hedonic prices and the demand for clean air. Journal of Environmental Economics and Management, 5(1), 81-102."
  },
  {
    name: "Iris",
    description: "Classic multivariate dataset for classification of iris flower species",
    category: "AI/ML",
    url: "https://archive.ics.uci.edu/ml/datasets/iris",
    format: "CSV",
    license: "CC0",
    tasks: ["classification", "clustering", "dimensionality reduction", "beginner ML"],
    size: "150 samples",
    features: ["4 numeric features", "3 species classes", "Sepal and petal measurements"],
    citation: "Fisher, R. A. (1936). The use of multiple measurements in taxonomic problems. Annals of Eugenics, 7(2), 179-188."
  },
  {
    name: "Wine Quality",
    description: "Physicochemical properties and quality ratings of Portuguese wines",
    category: "AI/ML",
    url: "https://archive.ics.uci.edu/ml/datasets/wine+quality",
    format: "CSV",
    license: "CC BY 4.0",
    tasks: ["regression", "classification", "ordinal regression"],
    size: "6,497 samples (red + white)",
    features: ["11 physicochemical features", "Quality score 0-10", "Red and white variants"],
    citation: "Cortez, P., Cerdeira, A., Almeida, F., Matos, T., & Reis, J. (2009). Modeling wine preferences by data mining from physicochemical properties. Decision Support Systems, 47(4), 547-553."
  },
  {
    name: "Diabetes Dataset",
    description: "Diabetes progression one year after baseline with 10 baseline variables",
    category: "AI/ML",
    url: "https://scikit-learn.org/stable/modules/generated/sklearn.datasets.load_diabetes.html",
    format: "CSV",
    license: "BSD",
    tasks: ["regression", "medical prediction", "feature importance"],
    size: "442 samples",
    features: ["10 baseline variables", "Age, sex, BMI, blood pressure", "6 blood serum measurements"],
    citation: "Bradley Efron, Trevor Hastie, Iain Johnstone and Robert Tibshirani (2004) Least Angle Regression, Annals of Statistics."
  },
  {
    name: "Breast Cancer Wisconsin",
    description: "Features computed from digitized images of fine needle aspirates of breast mass",
    category: "AI/ML",
    url: "https://archive.ics.uci.edu/ml/datasets/breast+cancer+wisconsin+(diagnostic)",
    format: "CSV",
    license: "CC0",
    tasks: ["binary classification", "medical diagnosis", "feature selection"],
    size: "569 samples",
    features: ["30 numeric features", "Cell nucleus characteristics", "Malignant/benign labels"],
    citation: "Street, W. N., Wolberg, W. H., & Mangasarian, O. L. (1993). Nuclear feature extraction for breast tumor diagnosis. IS&T/SPIE International Symposium on Electronic Imaging."
  },
  {
    name: "Digits",
    description: "8x8 pixel images of handwritten digits from UCI ML repository",
    category: "AI/ML",
    url: "https://scikit-learn.org/stable/modules/generated/sklearn.datasets.load_digits.html",
    format: "CSV",
    license: "BSD",
    tasks: ["image classification", "clustering", "dimensionality reduction"],
    size: "1,797 samples",
    features: ["8x8 images", "64 pixels flattened", "10 digit classes"],
    citation: "Alpaydin, E., & Kaynak, C. (1998). Cascading classifiers. Kybernetika, 34(4), 369-374."
  },

  // ==========================================================================
  // NLP - Natural Language Processing
  // ==========================================================================
  {
    name: "IMDB Reviews",
    description: "50,000 movie reviews for binary sentiment classification",
    category: "NLP",
    url: "https://ai.stanford.edu/~amaas/data/sentiment/",
    format: "Text files",
    license: "Research Use",
    tasks: ["sentiment analysis", "text classification", "binary classification"],
    size: "50,000 reviews",
    features: ["Binary labels (pos/neg)", "25k train / 25k test", "Raw text format"],
    citation: "Maas, A. L., Daly, R. E., Pham, P. T., Huang, D., Ng, A. Y., & Potts, C. (2011). Learning word vectors for sentiment analysis. ACL 2011."
  },
  {
    name: "SST-2",
    description: "Stanford Sentiment Treebank for sentiment analysis with fine-grained labels",
    category: "NLP",
    url: "https://nlp.stanford.edu/sentiment/",
    format: "TSV",
    license: "Research Use",
    tasks: ["sentiment analysis", "text classification", "fine-grained analysis"],
    size: "11,855 sentences",
    features: ["Phrase-level annotations", "Parse trees", "5 sentiment levels"],
    citation: "Socher, R., Perelygin, A., Wu, J., Chuang, J., Manning, C. D., Ng, A. Y., & Potts, C. (2013). Recursive deep models for semantic compositionality. EMNLP 2013."
  },
  {
    name: "GLUE Benchmark",
    description: "General Language Understanding Evaluation benchmark with 9 tasks",
    category: "NLP",
    url: "https://gluebenchmark.com/",
    format: "JSON, TSV",
    license: "Various",
    tasks: ["NLU", "text classification", "sentence similarity", "QA"],
    size: "Varies by task",
    features: ["9 diverse tasks", "MNLI, SST-2, CoLA, etc.", "Standardized evaluation"],
    citation: "Wang, A., Singh, A., Michael, J., Hill, F., Levy, O., & Bowman, S. R. (2019). GLUE: A multi-task benchmark and analysis platform for natural language understanding. ICLR 2019."
  },
  {
    name: "SuperGLUE",
    description: "More challenging successor to GLUE with harder language understanding tasks",
    category: "NLP",
    url: "https://super.gluebenchmark.com/",
    format: "JSON",
    license: "Various",
    tasks: ["NLU", "reasoning", "QA", "coreference resolution"],
    size: "Varies by task",
    features: ["8 challenging tasks", "BoolQ, CB, COPA, MultiRC, ReCoRD, RTE, WiC, WSC", "Human performance baselines"],
    citation: "Wang, A., Pruksachatkun, Y., Nangia, N., et al. (2019). SuperGLUE: A stickier benchmark for general-purpose language understanding systems. NeurIPS 2019."
  },
  {
    name: "SQuAD",
    description: "Stanford Question Answering Dataset with 100k+ questions on Wikipedia articles",
    category: "NLP",
    url: "https://rajpurkar.github.io/SQuAD-explorer/",
    format: "JSON",
    license: "CC BY-SA 4.0",
    tasks: ["question answering", "reading comprehension", "extractive QA"],
    size: "100,000+ questions",
    features: ["Wikipedia passages", "Crowdsourced questions", "Answer spans"],
    citation: "Rajpurkar, P., Zhang, J., Lopyrev, K., & Liang, P. (2016). SQuAD: 100,000+ questions for machine comprehension of text. EMNLP 2016."
  },
  {
    name: "SQuAD 2.0",
    description: "SQuAD with unanswerable questions added",
    category: "NLP",
    url: "https://rajpurkar.github.io/SQuAD-explorer/",
    format: "JSON",
    license: "CC BY-SA 4.0",
    tasks: ["question answering", "reading comprehension", "answerability detection"],
    size: "150,000+ questions",
    features: ["Unanswerable questions", "Adversarial examples", "Improved evaluation"],
    citation: "Rajpurkar, P., Jia, R., & Liang, P. (2018). Know what you don't know: Unanswerable questions for SQuAD. ACL 2018."
  },
  {
    name: "WikiText-103",
    description: "Large-scale language modeling dataset from verified Wikipedia articles",
    category: "NLP",
    url: "https://blog.einstein.ai/the-wikitext-long-term-dependency-language-modeling-dataset/",
    format: "Text",
    license: "CC BY-SA 3.0",
    tasks: ["language modeling", "text generation", "long-term dependencies"],
    size: "103M tokens",
    features: ["High quality articles", "Long context", "Standard LM benchmark"],
    citation: "Merity, S., Xiong, C., Bradbury, J., & Socher, R. (2016). Pointer sentinel mixture models. ICLR 2017."
  },
  {
    name: "WikiText-2",
    description: "Smaller version of WikiText-103 for faster experimentation",
    category: "NLP",
    url: "https://blog.einstein.ai/the-wikitext-long-term-dependency-language-modeling-dataset/",
    format: "Text",
    license: "CC BY-SA 3.0",
    tasks: ["language modeling", "text generation", "quick prototyping"],
    size: "2M tokens",
    features: ["Small scale", "Same quality as WT-103", "Fast iteration"],
    citation: "Merity, S., Xiong, C., Bradbury, J., & Socher, R. (2016). Pointer sentinel mixture models. ICLR 2017."
  },
  {
    name: "CoNLL-2003 NER",
    description: "Named Entity Recognition dataset with Reuters news articles",
    category: "NLP",
    url: "https://www.clips.uantwerpen.be/conll2003/ner/",
    format: "IOB2",
    license: "Research Use",
    tasks: ["named entity recognition", "sequence labeling", "information extraction"],
    size: "14,041 sentences",
    features: ["4 entity types (PER, ORG, LOC, MISC)", "English and German", "IOB2 format"],
    citation: "Sang, E. F., & De Meulder, F. (2003). Introduction to the CoNLL-2003 shared task: Language-independent named entity recognition. NAACL-HLT 2003."
  },
  {
    name: "Penn Treebank",
    description: "Annotated corpus of American English for parsing and POS tagging",
    category: "NLP",
    url: "https://catalog.ldc.upenn.edu/LDC99T42",
    format: "Treebank",
    license: "LDC License",
    tasks: ["parsing", "POS tagging", "syntactic analysis"],
    size: "~1M words",
    features: ["Syntactic parse trees", "POS annotations", "Standard benchmark"],
    citation: "Marcus, M. P., Marcinkiewicz, M. A., & Santorini, B. (1993). Building a large annotated corpus of English: The Penn Treebank. Computational Linguistics, 19(2), 313-330."
  },
  {
    name: "MultiNLI",
    description: "Multi-Genre Natural Language Inference corpus",
    category: "NLP",
    url: "https://cims.nyu.edu/~sbowman/multinli/",
    format: "JSONL",
    license: "OANC",
    tasks: ["natural language inference", "text entailment", "NLU"],
    size: "433k sentence pairs",
    features: ["10 genres", "Matched/mismatched test sets", "Entailment labels"],
    citation: "Williams, A., Nangia, N., & Bowman, S. R. (2018). A broad-coverage challenge corpus for sentence understanding through inference. NAACL 2018."
  },
  {
    name: "CoLA",
    description: "Corpus of Linguistic Acceptability for grammatical judgment",
    category: "NLP",
    url: "https://nyu-mll.github.io/CoLA/",
    format: "TSV",
    license: "CC BY 4.0",
    tasks: ["grammaticality judgment", "linguistic acceptability", "syntax"],
    size: "10,657 sentences",
    features: ["Binary acceptability", "Expert annotations", "In-domain/out-of-domain split"],
    citation: "Warstadt, A., Singh, A., & Bowman, S. R. (2019). Neural network acceptability judgments. TACL 7, 625-641."
  },
  {
    name: "AG News",
    description: "News articles categorized into 4 topic classes",
    category: "NLP",
    url: "https://www.di.unipi.it/~gulli/AG_corpus_of_news_articles.html",
    format: "CSV",
    license: "Research Use",
    tasks: ["text classification", "topic classification", "news categorization"],
    size: "1M articles",
    features: ["4 classes (World, Sports, Business, Sci/Tech)", "Title and description", "Large scale"],
    citation: "Zhang, X., Zhao, J., & LeCun, Y. (2015). Character-level convolutional networks for text classification. NeurIPS 2015."
  },
  {
    name: "Yelp Reviews",
    description: "Yelp restaurant reviews with star ratings",
    category: "NLP",
    url: "https://www.yelp.com/dataset",
    format: "JSON",
    license: "Yelp License",
    tasks: ["sentiment analysis", "rating prediction", "text classification"],
    size: "7M+ reviews",
    features: ["1-5 star ratings", "Full review text", "Business metadata"],
    citation: "Yelp. (2017). Yelp Dataset Challenge. Retrieved from https://www.yelp.com/dataset"
  },
  {
    name: "20 Newsgroups",
    description: "Collection of approximately 20,000 newsgroup documents across 20 categories",
    category: "NLP",
    url: "http://qwone.com/~jason/20Newsgroups/",
    format: "Text",
    license: "Public Domain",
    tasks: ["text classification", "topic modeling", "document clustering"],
    size: "20,000 documents",
    features: ["20 categories", "Train/test split", "Raw text with headers"],
    citation: "Lang, K. (1995). Newsweeder: Learning to filter netnews. ICML 1995."
  },
  {
    name: "GloVe Vectors",
    description: "Pre-trained word vectors from Stanford NLP group",
    category: "NLP",
    url: "https://nlp.stanford.edu/projects/glove/",
    format: "Text",
    license: "Public Domain",
    tasks: ["word embeddings", "semantic similarity", "transfer learning"],
    size: "Varies (6B/42B/840B tokens)",
    features: ["50-300 dimensional", "Multiple corpora", "Subword information"],
    citation: "Pennington, J., Socher, R., & Manning, C. D. (2014). GloVe: Global vectors for word representation. EMNLP 2014."
  },
  {
    name: "WordNet",
    description: "Lexical database of semantic relations between words",
    category: "NLP",
    url: "https://wordnet.princeton.edu/",
    format: "XML, various",
    license: "Princeton License",
    tasks: ["word sense disambiguation", "semantic similarity", "lexical semantics"],
    size: "155,287 words",
    features: ["Synsets", "Hypernyms/hyponyms", "Noun, verb, adjective, adverb"],
    citation: "Miller, G. A. (1995). WordNet: a lexical database for English. Communications of the ACM, 38(11), 39-41."
  },
  {
    name: "TREC Question Classification",
    description: "Question classification dataset from TREC competitions",
    category: "NLP",
    url: "https://cogcomp.seas.upenn.edu/Data/QA/QC/",
    format: "Text",
    license: "Research Use",
    tasks: ["question classification", "text classification", "QA"],
    size: "5,452 questions",
    features: ["6 coarse classes", "50 fine classes", "Question categorization"],
    citation: "Li, X., & Roth, D. (2002). Learning question classifiers. COLING 2002."
  },

  // ==========================================================================
  // Computer Vision
  // ==========================================================================
  {
    name: "COCO",
    description: "Common Objects in Context - large-scale object detection, segmentation, and captioning dataset",
    category: "Computer Vision",
    url: "https://cocodataset.org/",
    format: "JSON, JPEG",
    license: "CC BY 4.0",
    tasks: ["object detection", "instance segmentation", "image captioning", "keypoint detection"],
    size: "330K images, 2.5M labels",
    features: ["80 object categories", "Instance segmentation masks", "5 captions per image", "Keypoint annotations"],
    citation: "Lin, T. Y., Maire, M., Belongie, S., et al. (2014). Microsoft COCO: Common objects in context. ECCV 2014."
  },
  {
    name: "PASCAL VOC",
    description: "Visual Object Classes challenge dataset",
    category: "Computer Vision",
    url: "http://host.robots.ox.ac.uk/pascal/VOC/",
    format: "XML, JPEG",
    license: "Research Use",
    tasks: ["object detection", "image classification", "semantic segmentation"],
    size: "20,000+ images",
    features: ["20 object classes", "Bounding boxes", "Segmentation masks"],
    citation: "Everingham, M., Van Gool, L., Williams, C. K., Winn, J., & Zisserman, A. (2010). The Pascal Visual Object Classes (VOC) challenge. IJCV, 88(2), 303-338."
  },
  {
    name: "Open Images",
    description: "Large-scale dataset with 9M images annotated with labels, boxes, and segmentation masks",
    category: "Computer Vision",
    url: "https://storage.googleapis.com/openimages/web/index.html",
    format: "CSV, JPEG",
    license: "CC BY 2.0",
    tasks: ["object detection", "visual relationship detection", "instance segmentation"],
    size: "9M images, 16M boxes",
    features: ["600 object classes", "Visual relationships", "Instance-level masks", "Localized narratives"],
    citation: "Kuznetsova, A., Rom, H., Alldrin, N., et al. (2020). The open images dataset v4: Unified image classification, object detection, and visual relationship detection at scale. IJCV, 128(7), 1956-1981."
  },
  {
    name: "Cityscapes",
    description: "Urban street scenes for semantic understanding",
    category: "Computer Vision",
    url: "https://www.cityscapes-dataset.com/",
    format: "PNG, JSON",
    license: "Cityscapes License",
    tasks: ["semantic segmentation", "instance segmentation", "autonomous driving"],
    size: "25,000 images",
    features: ["30 classes", "Pixel-level annotations", "19 evaluation classes", "Stereo video"],
    citation: "Cordts, M., Omran, M., Ramos, S., et al. (2016). The cityscapes dataset for semantic urban scene understanding. CVPR 2016."
  },
  {
    name: "KITTI",
    description: "Autonomous driving dataset with camera, LiDAR, and GPS data",
    category: "Computer Vision",
    url: "http://www.cvlibs.net/datasets/kitti/",
    format: "PNG, BIN, TXT",
    license: "CC BY-NC-SA 3.0",
    tasks: ["stereo vision", "optical flow", "3D object detection", "SLAM"],
    size: "6 hours of driving",
    features: ["LiDAR point clouds", "Stereo cameras", "GPS/IMU data", "3D bounding boxes"],
    citation: "Geiger, A., Lenz, P., & Urtasun, R. (2012). Are we ready for autonomous driving? The KITTI vision benchmark suite. CVPR 2012."
  },
  {
    name: "LFW",
    description: "Labeled Faces in the Wild for face recognition",
    category: "Computer Vision",
    url: "http://vis-www.cs.umass.edu/lfw/",
    format: "JPEG",
    license: "Research Use",
    tasks: ["face recognition", "face verification", "biometrics"],
    size: "13,233 images",
    features: ["5,749 identities", "Unconstrained conditions", "Pairs for verification"],
    citation: "Huang, G. B., Mattar, M., Berg, T., & Learned-Miller, E. (2008). Labeled faces in the wild: A database for studying face recognition in unconstrained environments. ECCV 2008."
  },
  {
    name: "CelebA",
    description: "Large-scale CelebFaces Attributes dataset",
    category: "Computer Vision",
    url: "https://mmlab.ie.cuhk.edu.hk/projects/CelebA.html",
    format: "JPEG, TXT",
    license: "Research Use",
    tasks: ["face attribute prediction", "face detection", "face recognition"],
    size: "202,599 images",
    features: ["10,177 identities", "40 binary attributes", "5 landmark locations", "Large diversity"],
    citation: "Liu, Z., Luo, P., Wang, X., & Tang, X. (2015). Deep learning face attributes in the wild. ICCV 2015."
  },
  {
    name: "ADE20K",
    description: "Scene parsing dataset with dense annotations",
    category: "Computer Vision",
    url: "https://groups.csail.mit.edu/vision/datasets/ADE20K/",
    format: "PNG, JPG",
    license: "BSD",
    tasks: ["scene parsing", "semantic segmentation", "instance segmentation"],
    size: "25,210 images",
    features: ["150 semantic categories", "3,688 instance categories", "Dense annotations"],
    citation: "Zhou, B., Zhao, H., Puig, X., et al. (2017). Scene parsing through ADE20K dataset. CVPR 2017."
  },
  {
    name: "Places365",
    description: "Scene recognition dataset with 10M+ images",
    category: "Computer Vision",
    url: "http://places2.csail.mit.edu/",
    format: "JPEG",
    license: "MIT",
    tasks: ["scene recognition", "scene classification", "place categorization"],
    size: "10M+ images",
    features: ["365 scene categories", "High diversity", "CNN training"],
    citation: "Zhou, B., Lapedriza, A., Khosla, A., et al. (2017). Places: A 10 million image database for scene recognition. IEEE TPAMI, 40(6), 1452-1464."
  },
  {
    name: "ImageNet-V2",
    description: "Test set for measuring ImageNet model robustness",
    category: "Computer Vision",
    url: "https://github.com/modestyachts/ImageNetV2",
    format: "JPEG",
    license: "Research Use",
    tasks: ["image classification", "robustness evaluation", "distribution shift"],
    size: "10,000 images",
    features: ["Matched to ImageNet classes", "Three test sets", "Strict collection protocol"],
    citation: "Recht, B., Roelofs, R., Schmidt, L., & Shankar, V. (2019). Do imagenet classifiers generalize to imagenet? ICML 2019."
  },
  {
    name: "MS COCO Captions",
    description: "Image captioning dataset with 5 human captions per image",
    category: "Computer Vision",
    url: "https://cocodataset.org/",
    format: "JSON",
    license: "CC BY 4.0",
    tasks: ["image captioning", "vision-language", "multimodal learning"],
    size: "330K images, 1.5M captions",
    features: ["5 captions per image", "Diverse descriptions", "Object relationships"],
    citation: "Chen, X., Fang, H., Lin, T. Y., et al. (2015). Microsoft COCO captions: Data collection and evaluation server. arXiv:1504.00325."
  },
  {
    name: "Flickr30k",
    description: "Image captioning dataset with 30k images and 5 captions each",
    category: "Computer Vision",
    url: "http://shannon.cs.illinois.edu/DenotationGraph/",
    format: "TXT, JPG",
    license: "Research Use",
    tasks: ["image captioning", "vision-language", "multimodal learning"],
    size: "31,783 images, 158,915 captions",
    features: ["Everyday activities", "5 captions per image", "Entity mentions"],
    citation: "Young, P., Lai, A., Hodosh, M., & Hockenmaier, J. (2014). From image descriptions to visual denotations. TACL 2, 67-78."
  },
  {
    name: "DeepFashion",
    description: "Large-scale fashion dataset with rich annotations",
    category: "Computer Vision",
    url: "http://mmlab.ie.cuhk.edu.hk/projects/DeepFashion.html",
    format: "JPEG, CSV",
    license: "Research Use",
    tasks: ["fashion recognition", "attribute prediction", "landmark detection"],
    size: "800,000 images",
    features: ["50 categories", "1,000 attributes", "Landmarks", "Consumer-to-shop pairs"],
    citation: "Liu, Z., Luo, P., Qiu, S., Wang, X., & Tang, X. (2016). DeepFashion: Powering robust clothes recognition and retrieval with rich annotations. CVPR 2016."
  },
  {
    name: "MPII Human Pose",
    description: "Human pose estimation dataset with 25k images",
    category: "Computer Vision",
    url: "http://human-pose.mpi-inf.mpg.de/",
    format: "JPEG, MAT",
    license: "Research Use",
    tasks: ["human pose estimation", "keypoint detection", "activity recognition"],
    size: "25,000 images",
    features: ["16 body joints", "40k people", "Diverse activities", "3D annotations"],
    citation: "Andriluka, M., Pishchulin, L., Gehler, P., & Schiele, B. (2014). 2D human pose estimation: New benchmark and state of the art analysis. CVPR 2014."
  },
  {
    name: "DAVIS",
    description: "Densely Annotated VIdeo Segmentation dataset",
    category: "Computer Vision",
    url: "https://davischallenge.org/",
    format: "MP4, PNG",
    license: "Research Use",
    tasks: ["video object segmentation", "video segmentation", "object tracking"],
    size: "150 video sequences",
    features: ["High-quality annotations", "Multiple objects", "Scribble annotations"],
    citation: "Pont-Tuset, J., Perazzi, F., Caelles, S., et al. (2017). The 2017 DAVIS challenge on video object segmentation. arXiv:1704.00675."
  },

  // ==========================================================================
  // Biology/Genomics
  // ==========================================================================
  {
    name: "Human Genome Project",
    description: "Complete human genome sequence and analysis",
    category: "Biology/Genomics",
    url: "https://www.ncbi.nlm.nih.gov/grc/human/",
    format: "FASTA, VCF",
    license: "Public Domain",
    tasks: ["genome assembly", "variant calling", "genomic analysis"],
    size: "3.2 billion base pairs",
    features: ["Reference genome", "Gene annotations", "Variation data"],
    citation: "International Human Genome Sequencing Consortium. (2001). Initial sequencing and analysis of the human genome. Nature, 409(6822), 860-921."
  },
  {
    name: "1000 Genomes Project",
    description: "Catalog of human genetic variation from diverse populations",
    category: "Biology/Genomics",
    url: "https://www.internationalgenome.org/",
    format: "VCF, BAM",
    license: "Public Domain",
    tasks: ["population genetics", "variant discovery", "GWAS"],
    size: "2,504 genomes",
    features: ["26 populations", "84.7M variants", "Phase 3 complete"],
    citation: "1000 Genomes Project Consortium. (2015). A global reference for human genetic variation. Nature, 526(7571), 68-74."
  },
  {
    name: "ENCODE",
    description: "Encyclopedia of DNA Elements with functional genomic elements",
    category: "Biology/Genomics",
    url: "https://www.encodeproject.org/",
    format: "BED, BAM, FASTQ",
    license: "Public Domain",
    tasks: ["functional genomics", "gene regulation", "epigenomics"],
    size: "9,000+ experiments",
    features: ["ChIP-seq", "RNA-seq", "DNase-seq", "Histone modifications"],
    citation: "ENCODE Project Consortium. (2012). An integrated encyclopedia of DNA elements in the human genome. Nature, 489(7414), 57-74."
  },
  {
    name: "GTEx",
    description: "Genotype-Tissue Expression project for tissue-specific gene regulation",
    category: "Biology/Genomics",
    url: "https://gtexportal.org/",
    format: "VCF, expression matrices",
    license: "dbGaP",
    tasks: ["expression quantitative trait loci", "tissue-specific expression", "transcriptomics"],
    size: "17,382 samples, 54 tissues",
    features: ["eQTL data", "Tissue-specific expression", "Genotype data"],
    citation: "GTEx Consortium. (2017). Genetic effects on gene expression across human tissues. Nature, 550(7675), 204-213."
  },
  {
    name: "TCGA",
    description: "The Cancer Genome Atlas with multi-omics cancer data",
    category: "Biology/Genomics",
    url: "https://portal.gdc.cancer.gov/",
    format: "Various (BAM, VCF, TXT)",
    license: "dbGaP",
    tasks: ["cancer genomics", "survival analysis", "molecular subtyping"],
    size: "11,000+ patients",
    features: ["33 cancer types", "Genomic, transcriptomic, proteomic", "Clinical data"],
    citation: "Cancer Genome Atlas Research Network. (2013). The Cancer Genome Atlas Pan-Cancer analysis project. Nature Genetics, 45(10), 1113-1120."
  },
  {
    name: "PDB",
    description: "Protein Data Bank with 3D structural data of biological macromolecules",
    category: "Biology/Genomics",
    url: "https://www.rcsb.org/",
    format: "PDB, mmCIF",
    license: "Public Domain",
    tasks: ["protein structure prediction", "structural biology", "drug design"],
    size: "200,000+ structures",
    features: ["3D coordinates", "X-ray, NMR, Cryo-EM", "Ligand binding sites"],
    citation: "Berman, H. M., Westbrook, J., Feng, Z., et al. (2000). The Protein Data Bank. Nucleic Acids Research, 28(1), 235-242."
  },
  {
    name: "UniProt",
    description: "Universal protein resource with sequence and annotation data",
    category: "Biology/Genomics",
    url: "https://www.uniprot.org/",
    format: "FASTA, XML, RDF",
    license: "CC BY 4.0",
    tasks: ["protein annotation", "sequence analysis", "functional prediction"],
    size: "220M+ sequences",
    features: ["Swiss-Prot curated", "TrEMBL automatic", "GO annotations", "Protein families"],
    citation: "UniProt Consortium. (2019). UniProt: a worldwide hub of protein knowledge. Nucleic Acids Research, 47(D1), D506-D515."
  },
  {
    name: "RefSeq",
    description: "Reference Sequence database for genomes, transcripts, and proteins",
    category: "Biology/Genomics",
    url: "https://www.ncbi.nlm.nih.gov/refseq/",
    format: "FASTA, GFF",
    license: "Public Domain",
    tasks: ["reference sequences", "genome annotation", "phylogenetics"],
    size: "200M+ sequences",
    features: ["Curated references", "Non-redundant", "Multiple organisms"],
    citation: "O'Leary, N. A., Wright, M. W., Brister, J. R., et al. (2016). Reference sequence (RefSeq) database at NCBI: current status, taxonomic expansion, and functional annotation. Nucleic Acids Research, 44(D1), D733-D745."
  },
  {
    name: "GEO",
    description: "Gene Expression Omnibus for functional genomics data",
    category: "Biology/Genomics",
    url: "https://www.ncbi.nlm.nih.gov/geo/",
    format: "Various",
    license: "Public Domain",
    tasks: ["gene expression", "microarray", "RNA-seq", "epigenetics"],
    size: "5M+ samples",
    features: ["Array and sequence data", "Series records", "Platform annotations"],
    citation: "Barrett, T., Wilhite, S. E., Ledoux, P., et al. (2013). NCBI GEO: archive for functional genomics data sets--update. Nucleic Acids Research, 41(D1), D991-D995."
  },
  {
    name: "dbSNP",
    description: "Database of short genetic variations",
    category: "Biology/Genomics",
    url: "https://www.ncbi.nlm.nih.gov/snp/",
    format: "VCF",
    license: "Public Domain",
    tasks: ["variant annotation", "SNP analysis", "genetic variation"],
    size: "1B+ variants",
    features: ["SNPs, indels", "Population frequencies", "Clinical significance"],
    citation: "Sherry, S. T., Ward, M. H., Kholodov, M., et al. (2001). dbSNP: the NCBI database of genetic variation. Nucleic Acids Research, 29(1), 308-311."
  },
  {
    name: "ClinVar",
    description: "Database of clinically significant variants",
    category: "Biology/Genomics",
    url: "https://www.ncbi.nlm.nih.gov/clinvar/",
    format: "VCF, XML",
    license: "Public Domain",
    tasks: ["clinical genomics", "variant interpretation", "precision medicine"],
    size: "1M+ variants",
    features: ["Clinical significance", "Disease associations", "Evidence-based"],
    citation: "Landrum, M. J., Lee, J. M., Benson, M., et al. (2018). ClinVar: improving access to variant interpretations and supporting evidence. Nucleic Acids Research, 46(D1), D1062-D1067."
  },

  // ==========================================================================
  // Medicine/Healthcare
  // ==========================================================================
  {
    name: "MIMIC-IV",
    description: "Medical Information Mart for Intensive Care with de-identified health data",
    category: "Medicine/Healthcare",
    url: "https://mimic.mit.edu/",
    format: "CSV, PARQUET",
    license: "Credentialed Health Use",
    tasks: ["clinical prediction", "health informatics", "survival analysis"],
    size: "300,000+ patients",
    features: ["ICU data", "Laboratory results", "Vital signs", "Medications"],
    citation: "Johnson, A., Bulgarelli, L., Pollard, T., et al. (2023). MIMIC-IV. PhysioNet."
  },
  {
    name: "MIMIC-CXR",
    description: "Chest X-ray database with free-text radiology reports",
    category: "Medicine/Healthcare",
    url: "https://physionet.org/content/mimic-cxr/",
    format: "DICOM, JPG, CSV",
    license: "Credentialed Health Use",
    tasks: ["medical imaging", "report generation", "disease classification"],
    size: "377,000 images",
    features: ["Chest X-rays", "Radiology reports", "14 disease labels", "Multi-view"],
    citation: "Johnson, A. E., Pollard, T. J., Berkowitz, S. J., et al. (2019). MIMIC-CXR, a de-identified publicly available database of chest radiographs with free-text reports. Scientific Data, 6(1), 317."
  },
  {
    name: "ChestX-ray14",
    description: "NIH chest X-ray dataset with 14 common thoracic diseases",
    category: "Medicine/Healthcare",
    url: "https://nihcc.app.box.com/v/ChestXray-NIHCC",
    format: "PNG, CSV",
    license: "Research Use",
    tasks: ["medical imaging", "multi-label classification", "disease detection"],
    size: "112,120 images",
    features: ["14 disease labels", "Frontal view X-rays", "30,805 unique patients"],
    citation: "Wang, X., Peng, Y., Lu, L., Lu, Z., Bagheri, M., & Summers, R. M. (2017). ChestX-ray8: Hospital-scale chest X-ray database and benchmarks on weakly-supervised classification and localization of common thorax diseases. CVPR 2017."
  },
  {
    name: "ISIC Archive",
    description: "International Skin Imaging Collaboration for melanoma detection",
    category: "Medicine/Healthcare",
    url: "https://www.isic-archive.com/",
    format: "JPEG, JSON",
    license: "CC BY-NC",
    tasks: ["skin lesion classification", "melanoma detection", "medical imaging"],
    size: "70,000+ images",
    features: ["Dermoscopic images", "Diagnostic categories", "Lesion segmentation"],
    citation: "Codella, N. C., Gutman, D., Celebi, M. E., et al. (2018). Skin lesion analysis toward melanoma detection: A challenge at the 2017 international symposium on biomedical imaging (ISBI). CVPRW 2018."
  },
  {
    name: "OASIS",
    description: "Open Access Series of Imaging Studies for brain MRI",
    category: "Medicine/Healthcare",
    url: "https://www.oasis-brains.org/",
    format: "NIfTI",
    license: "Research Use",
    tasks: ["brain imaging", "Alzheimer's detection", "neuroimaging"],
    size: "2,000+ sessions",
    features: ["Cross-sectional and longitudinal", "Clinical dementia rating", "FreeSurfer processed"],
    citation: "Marcus, D. S., Wang, T. H., Parker, J., Csernansky, J. G., Morris, J. C., & Buckner, R. L. (2007). Open Access Series of Imaging Studies (OASIS): cross-sectional MRI data in young, middle aged, nondemented, and demented older adults. Journal of Cognitive Neuroscience, 19(9), 1498-1507."
  },
  {
    name: "ADNI",
    description: "Alzheimer's Disease Neuroimaging Initiative",
    category: "Medicine/Healthcare",
    url: "https://adni.loni.usc.edu/",
    format: "NIfTI, CSV",
    license: "Research Use",
    tasks: ["Alzheimer's research", "biomarker discovery", "neuroimaging"],
    size: "2,000+ subjects",
    features: ["MRI, PET, CSF", "Longitudinal design", "Clinical assessments"],
    citation: "Mueller, S. G., Weiner, M. W., Thal, L. J., et al. (2005). The Alzheimer's disease neuroimaging initiative. Neuroimaging Clinics of North America, 15(4), 869-877."
  },
  {
    name: "UK Biobank",
    description: "Large-scale biomedical database with genetic and health information",
    category: "Medicine/Healthcare",
    url: "https://www.ukbiobank.ac.uk/",
    format: "Various",
    license: "Research Use",
    tasks: ["genomic medicine", "epidemiology", "population health"],
    size: "500,000 participants",
    features: ["Genetic data", "Imaging data", "Health records", "Lifestyle data"],
    citation: "Sudlow, C., Gallacher, J., Allen, N., et al. (2015). UK biobank: an open access resource for the causes of a wide range of complex diseases of middle and old age. PLoS Medicine, 12(3), e1001779."
  },
  {
    name: "PhysioNet",
    description: "Repository of physiological signals and time series data",
    category: "Medicine/Healthcare",
    url: "https://physionet.org/",
    format: "Various (WFDB, EDF)",
    license: "Various",
    tasks: ["physiological signal processing", "ECG analysis", "time series forecasting"],
    size: "100+ databases",
    features: ["ECG, EEG, PPG", "Waveform data", "Critical care data"],
    citation: "Goldberger, A. L., Amaral, L. A., Glass, L., et al. (2000). PhysioBank, PhysioToolkit, and PhysioNet: components of a new research resource for complex physiologic signals. Circulation, 101(23), e215-e220."
  },
  {
    name: "PTB-XL",
    description: "Large publicly available electrocardiography dataset",
    category: "Medicine/Healthcare",
    url: "https://physionet.org/content/ptb-xl/",
    format: "WFDB",
    license: "ODC-By",
    tasks: ["ECG classification", "arrhythmia detection", "signal processing"],
    size: "21,837 records",
    features: ["10-second 12-lead ECGs", "71 diagnostic labels", "5,000+ patients"],
    citation: "Wagner, P., Strodthoff, N., Bousseljot, R. D., et al. (2020). PTB-XL, a large publicly available electrocardiography dataset. Scientific Data, 7(1), 154."
  },
  {
    name: "HAM10000",
    description: "Human Against Machine dermatology dataset",
    category: "Medicine/Healthcare",
    url: "https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/DBW86T",
    format: "JPEG, CSV",
    license: "CC BY-NC-SA 4.0",
    tasks: ["skin lesion classification", "dermatology AI", "medical imaging"],
    size: "10,015 images",
    features: ["7 diagnostic categories", "Dermoscopic images", "Multi-source"],
    citation: "Tschandl, P., Rosendahl, C., & Kittler, H. (2018). The HAM10000 dataset, a large collection of multi-source dermatoscopic images of common pigmented skin lesions. Scientific Data, 5(1), 180161."
  },
  {
    name: "COVID-19 Open Data",
    description: "Johns Hopkins COVID-19 global case data",
    category: "Medicine/Healthcare",
    url: "https://github.com/CSSEGISandData/COVID-19",
    format: "CSV",
    license: "CC BY 4.0",
    tasks: ["epidemiology", "time series forecasting", "public health"],
    size: "Global coverage",
    features: ["Daily case counts", "Deaths, recoveries", "Country/province level"],
    citation: "Dong, E., Du, H., & Gardner, L. (2020). An interactive web-based dashboard to track COVID-19 in real time. The Lancet Infectious Diseases, 20(5), 533-534."
  },
  {
    name: "Diabetes 130-US",
    description: "Hospital readmission data for diabetic patients",
    category: "Medicine/Healthcare",
    url: "https://archive.ics.uci.edu/ml/datasets/diabetes+130-us+hospitals+for+years+1999-2008",
    format: "CSV",
    license: "CC0",
    tasks: ["readmission prediction", "clinical risk modeling", "healthcare analytics"],
    size: "101,766 encounters",
    features: ["130 US hospitals", "10 years data", "Demographics, diagnoses, medications"],
    citation: "Strack, B., DeShazo, J. P., Gennings, C., et al. (2014). Impact of HbA1c measurement on hospital readmission rates: analysis of 70,000 clinical database patient records. BioMed Research International, 2014."
  },

  // ==========================================================================
  // Finance
  // ==========================================================================
  {
    name: "Yahoo Finance",
    description: "Historical stock price and financial data via API",
    category: "Finance",
    url: "https://finance.yahoo.com/",
    format: "CSV, JSON",
    license: "Yahoo Terms",
    tasks: ["stock price prediction", "time series analysis", "portfolio optimization"],
    size: "Global coverage",
    features: ["OHLCV data", "Dividends, splits", "Multiple markets"],
    citation: "Yahoo Finance. Historical stock data. Retrieved from https://finance.yahoo.com/"
  },
  {
    name: "FRED",
    description: "Federal Reserve Economic Data with macroeconomic indicators",
    category: "Finance",
    url: "https://fred.stlouisfed.org/",
    format: "CSV, JSON",
    license: "Public Domain",
    tasks: ["macroeconomic analysis", "time series forecasting", "economic research"],
    size: "800,000+ series",
    features: ["GDP, inflation, unemployment", "Interest rates", "International data"],
    citation: "Federal Reserve Bank of St. Louis. FRED Economic Data. Retrieved from https://fred.stlouisfed.org/"
  },
  {
    name: "Quandl/WIKI",
    description: "End-of-day stock prices for 3,000+ US companies",
    category: "Finance",
    url: "https://www.quandl.com/",
    format: "CSV, JSON",
    license: "Quandl Terms",
    tasks: ["stock analysis", "quantitative trading", "market research"],
    size: "3,000+ stocks",
    features: ["EOD prices", "Adjusted close", "Historical data"],
    citation: "Quandl. WIKI Stock Prices. Retrieved from https://www.quandl.com/"
  },
  {
    name: "SEC EDGAR",
    description: "Corporate financial filings and reports",
    category: "Finance",
    url: "https://www.sec.gov/edgar",
    format: "HTML, XBRL, TXT",
    license: "Public Domain",
    tasks: ["financial analysis", "NLP on filings", "fundamental analysis"],
    size: "Millions of filings",
    features: ["10-K, 10-Q, 8-K", "Financial statements", "Executive compensation"],
    citation: "U.S. Securities and Exchange Commission. EDGAR Filings. Retrieved from https://www.sec.gov/edgar"
  },
  {
    name: "Kaggle Financial Datasets",
    description: "Various financial datasets hosted on Kaggle",
    category: "Finance",
    url: "https://www.kaggle.com/datasets",
    format: "CSV",
    license: "Various",
    tasks: ["credit scoring", "fraud detection", "loan default prediction"],
    size: "Varies",
    features: ["Credit data", "Fraud labels", "Demographic features"],
    citation: "Kaggle. Financial datasets. Retrieved from https://www.kaggle.com/datasets"
  },
  {
    name: "Lending Club",
    description: "Peer-to-peer lending data with loan outcomes",
    category: "Finance",
    url: "https://www.lendingclub.com/info/download-data.action",
    format: "CSV",
    license: "Research Use",
    tasks: ["credit risk modeling", "loan default prediction", "P2P lending analysis"],
    size: "2.9M loans",
    features: ["Loan applications", "Borrower features", "Payment history", "Default outcomes"],
    citation: "Lending Club. Loan data. Retrieved from https://www.lendingclub.com/"
  },
  {
    name: "Credit Card Fraud",
    description: "European credit card transactions with fraud labels",
    category: "Finance",
    url: "https://www.kaggle.com/mlg-ulb/creditcardfraud",
    format: "CSV",
    license: "DbCL",
    tasks: ["fraud detection", "anomaly detection", "imbalanced classification"],
    size: "284,807 transactions",
    features: ["PCA-transformed features", "Time and amount", "492 frauds (0.172%)"],
    citation: "Dal Pozzolo, A., Caelen, O., Johnson, R. A., & Bontempi, G. (2015). Calibrating probability with undersampling for unbalanced classification. CIDM 2015."
  },
  {
    name: "World Bank Open Data",
    description: "Global development indicators and financial statistics",
    category: "Finance",
    url: "https://data.worldbank.org/",
    format: "CSV, JSON, XML",
    license: "CC BY 4.0",
    tasks: ["development economics", "cross-country analysis", "policy research"],
    size: "3,000+ indicators",
    features: ["GDP, trade, debt", "266 economies", "50+ years"],
    citation: "World Bank. World Development Indicators. Retrieved from https://data.worldbank.org/"
  },
  {
    name: "IMF Data",
    description: "International Monetary Fund economic statistics",
    category: "Finance",
    url: "https://data.imf.org/",
    format: "CSV, JSON, SDMX",
    license: "IMF Terms",
    tasks: ["international finance", "exchange rate analysis", "fiscal policy"],
    size: "Global coverage",
    features: ["Exchange rates", "Balance of payments", "Government finance"],
    citation: "International Monetary Fund. IMF Data. Retrieved from https://data.imf.org/"
  },
  {
    name: "S&P 500",
    description: "Historical data for S&P 500 companies",
    category: "Finance",
    url: "https://github.com/datasets/s-and-p-500-companies",
    format: "CSV",
    license: "ODC-PDDL",
    tasks: ["market analysis", "index tracking", "sector analysis"],
    size: "500 companies",
    features: ["Constituent list", "Sector classification", "Historical changes"],
    citation: "S&P Dow Jones Indices. S&P 500. Retrieved from https://us.spindices.com/"
  },
  {
    name: "Cryptocurrency Data",
    description: "Historical OHLCV data for cryptocurrencies",
    category: "Finance",
    url: "https://www.cryptodatadownload.com/",
    format: "CSV",
    license: "Public Domain",
    tasks: ["crypto price prediction", "volatility modeling", "market microstructure"],
    size: "100+ cryptocurrencies",
    features: ["OHLCV data", "Multiple exchanges", "High frequency"],
    citation: "CryptoDataDownload. Cryptocurrency historical data. Retrieved from https://www.cryptodatadownload.com/"
  },

  // ==========================================================================
  // Climate/Environment
  // ==========================================================================
  {
    name: "NOAA Climate Data",
    description: "National Oceanic and Atmospheric Administration climate records",
    category: "Climate/Environment",
    url: "https://www.ncdc.noaa.gov/cdo-web/",
    format: "CSV, NetCDF",
    license: "Public Domain",
    tasks: ["climate analysis", "temperature forecasting", "extreme weather detection"],
    size: "Global coverage",
    features: ["Temperature, precipitation", "Stations worldwide", "Historical records"],
    citation: "NOAA National Centers for Environmental Information. Climate Data Online. Retrieved from https://www.ncdc.noaa.gov/cdo-web/"
  },
  {
    name: "NASA GISS",
    description: "Goddard Institute for Space Studies surface temperature analysis",
    category: "Climate/Environment",
    url: "https://data.giss.nasa.gov/gistemp/",
    format: "CSV, NetCDF",
    license: "Public Domain",
    tasks: ["global warming analysis", "temperature trends", "climate modeling"],
    size: "1880-present",
    features: ["Global temperature anomalies", "Gridded data", "Station data"],
    citation: "Lenssen, N., Schmidt, G., Hansen, J., et al. (2019). Improvements in the GISTEMP uncertainty model. Journal of Geophysical Research: Atmospheres, 124(12), 6307-6326."
  },
  {
    name: "ERA5",
    description: "ECMWF atmospheric reanalysis of the global climate",
    category: "Climate/Environment",
    url: "https://cds.climate.copernicus.eu/cdsapp#!/dataset/reanalysis-era5-single-levels",
    format: "GRIB, NetCDF",
    license: "Copernicus License",
    tasks: ["weather forecasting", "climate reanalysis", "atmospheric modeling"],
    size: "1940-present, hourly",
    features: ["0.25 degree resolution", "137 levels", "Hourly estimates"],
    citation: "Hersbach, H., Bell, B., Berrisford, P., et al. (2020). The ERA5 global reanalysis. Quarterly Journal of the Royal Meteorological Society, 146(730), 1999-2049."
  },
  {
    name: "HadCRUT",
    description: "Global temperature dataset from UK Met Office",
    category: "Climate/Environment",
    url: "https://www.metoffice.gov.uk/hadobs/hadcrut5/",
    format: "NetCDF, CSV",
    license: "Open Government",
    tasks: ["temperature analysis", "climate change research", "trend detection"],
    size: "1850-present",
    features: ["Global and hemispheric", "Land and sea", "Uncertainty estimates"],
    citation: "Morice, C. P., Kennedy, J. J., Rayner, N. A., et al. (2021). An updated assessment of near-surface temperature change from 1850: the HadCRUT5 dataset. Journal of Geophysical Research: Atmospheres, 126(3), e2019JD032361."
  },
  {
    name: "Global Temperature",
    description: "Berkeley Earth surface temperature dataset",
    category: "Climate/Environment",
    url: "http://berkeleyearth.org/data/",
    format: "TXT, NetCDF",
    license: "ODC-ODbL",
    tasks: ["temperature analysis", "climate research", "data quality analysis"],
    size: "1750-present",
    features: ["1.6 billion records", "Quality controlled", "Urban heat island corrected"],
    citation: "Rohde, R. A., & Hausfather, Z. (2020). The Berkeley Earth Land/Ocean Temperature Record. Earth System Science Data, 12(4), 3469-3479."
  },
  {
    name: "Ocean Temperature",
    description: "NOAA Extended Reconstructed Sea Surface Temperature",
    category: "Climate/Environment",
    url: "https://www.ncei.noaa.gov/data/sea-surface-temperature-optimum-interpolation/",
    format: "NetCDF",
    license: "Public Domain",
    tasks: ["ocean modeling", "ENSO analysis", "marine climate"],
    size: "1981-present",
    features: ["Daily resolution", "0.25 degree grid", "SST anomalies"],
    citation: "Huang, B., Liu, C., Banzon, V., et al. (2021). Improvements of the daily optimum interpolation sea surface temperature (DOISST) version 2.1. Journal of Climate, 34(8), 2923-2939."
  },
  {
    name: "Ice Sheet Data",
    description: "NASA Ice Sheet Mass Balance Inter-comparison Exercise",
    category: "Climate/Environment",
    url: "https://imbie.org/",
    format: "NetCDF, CSV",
    license: "Research Use",
    tasks: ["ice sheet modeling", "sea level rise", "polar climate"],
    size: "1992-present",
    features: ["Greenland and Antarctica", "Mass balance", "Multiple techniques"],
    citation: "IMBIE team. (2018). Mass balance of the Antarctic Ice Sheet from 1992 to 2017. Nature, 558(7709), 219-222."
  },
  {
    name: "CO2 Measurements",
    description: "Mauna Loa CO2 measurements from NOAA",
    category: "Climate/Environment",
    url: "https://gml.noaa.gov/ccgg/trends/",
    format: "CSV",
    license: "Public Domain",
    tasks: ["carbon cycle analysis", "climate change", "time series forecasting"],
    size: "1958-present",
    features: ["Monthly averages", "Seasonal cycle", "Annual growth rate"],
    citation: "Keeling, R. F., & Keeling, C. D. (2017). Atmospheric monthly in situ CO2 data - Mauna Loa Observatory, Hawaii. Scripps Institution of Oceanography."
  },
  {
    name: "Air Quality",
    description: "EPA Air Quality System data",
    category: "Climate/Environment",
    url: "https://www.epa.gov/outdoor-air-quality-data",
    format: "CSV",
    license: "Public Domain",
    tasks: ["air quality modeling", "pollution forecasting", "health impact analysis"],
    size: "1980-present",
    features: ["PM2.5, O3, NO2", "Hourly data", "4,000+ monitors"],
    citation: "U.S. Environmental Protection Agency. Air Quality System Data. Retrieved from https://www.epa.gov/outdoor-air-quality-data"
  },
  {
    name: "Wildfire Data",
    description: "NASA MODIS and VIIRS active fire data",
    category: "Climate/Environment",
    url: "https://firms.modaps.eosdis.nasa.gov/",
    format: "CSV, SHP",
    license: "Public Domain",
    tasks: ["wildfire detection", "fire spread modeling", "climate impact"],
    size: "2000-present",
    features: ["Near real-time", "Global coverage", "Thermal anomalies"],
    citation: "Giglio, L., Schroeder, W., & Justice, C. O. (2016). The collection 6 MODIS active fire detection algorithm and fire products. Remote Sensing of Environment, 178, 31-41."
  },
  {
    name: "Sea Level",
    description: "CSIRO and NASA sea level rise data",
    category: "Climate/Environment",
    url: "https://sealevel.nasa.gov/",
    format: "CSV, NetCDF",
    license: "Public Domain",
    tasks: ["sea level rise modeling", "coastal impact assessment", "climate adaptation"],
    size: "1993-present",
    features: ["Satellite altimetry", "Global mean", "Regional trends"],
    citation: "Nerem, R. S., Beckley, B. D., Fasullo, J. T., et al. (2018). Climate-change-driven accelerated sea-level rise detected in the altimeter era. PNAS, 115(9), 2022-2025."
  },

  // ==========================================================================
  // Social Sciences
  // ==========================================================================
  {
    name: "World Values Survey",
    description: "Global survey of human values and beliefs across 100+ countries",
    category: "Social Sciences",
    url: "https://www.worldvaluessurvey.org/",
    format: "SPSS, CSV",
    license: "Research Use",
    tasks: ["social science research", "cross-cultural analysis", "survey methodology"],
    size: "120+ countries, 7 waves",
    features: ["Values, beliefs, norms", "Political attitudes", "Religious views"],
    citation: "Inglehart, R., C. Haerpfer, A. Moreno, et al. (Eds.). (2014). World Values Survey: Round Six - Country-Pooled Datafile Version. Madrid: JD Systems Institute."
  },
  {
    name: "General Social Survey",
    description: "NORC's long-running survey of American society",
    category: "Social Sciences",
    url: "https://gss.norc.org/",
    format: "SPSS, CSV, Stata",
    license: "Public Domain",
    tasks: ["sociological research", "trend analysis", "public opinion"],
    size: "60,000+ respondents",
    features: ["1972-present", "~90 minute interviews", "National representative"],
    citation: "Smith, T. W., Davern, M., Freese, J., & Morgan, S. L. (2021). General Social Surveys, 1972-2021. NORC at the University of Chicago."
  },
  {
    name: "Pew Research Center",
    description: "Public opinion polling and demographic research data",
    category: "Social Sciences",
    url: "https://www.pewresearch.org/download-datasets/",
    format: "SPSS, CSV",
    license: "Research Use",
    tasks: ["public opinion research", "demographic analysis", "social trends"],
    size: "100+ surveys",
    features: ["Politics, media, religion", "Global attitudes", "Internet & technology"],
    citation: "Pew Research Center. Various survey datasets. Retrieved from https://www.pewresearch.org/"
  },
  {
    name: "IPUMS",
    description: "Integrated Public Use Microdata Series for census data",
    category: "Social Sciences",
    url: "https://www.ipums.org/",
    format: "SAS, SPSS, Stata, CSV",
    license: "Research Use",
    tasks: ["demographic research", "census analysis", "social stratification"],
    size: "1B+ person records",
    features: ["USA and international", "Harmonized variables", "Historical data"],
    citation: "Ruggles, S., Flood, S., Foster, S., et al. (2021). IPUMS USA: Version 11.0 [dataset]. Minneapolis, MN: IPUMS."
  },
  {
    name: "Demographic Health Survey",
    description: "Population and health data from developing countries",
    category: "Social Sciences",
    url: "https://dhsprogram.com/",
    format: "SAS, SPSS, Stata",
    license: "Research Use",
    tasks: ["public health", "demography", "development economics"],
    size: "90+ countries",
    features: ["Fertility, mortality", "Nutrition", "HIV/AIDS indicators"],
    citation: "ICF. (2021). Demographic and Health Surveys (various) [Datasets]. Rockville, MD: ICF."
  },
  {
    name: "European Social Survey",
    description: "Cross-national survey measuring attitudes and behavior",
    category: "Social Sciences",
    url: "https://www.europeansocialsurvey.org/",
    format: "SPSS, Stata, CSV",
    license: "CC BY 4.0",
    tasks: ["comparative politics", "social attitudes", "European studies"],
    size: "40+ countries, 10 rounds",
    features: ["Biennial since 2002", "Rotating modules", "Rigorous methodology"],
    citation: "European Social Survey Cumulative File, ESS 1-10 (2022). NSD - Norwegian Centre for Research Data."
  },
  {
    name: "ANES",
    description: "American National Election Studies since 1948",
    category: "Social Sciences",
    url: "https://electionstudies.org/",
    format: "SPSS, Stata, CSV",
    license: "Public Domain",
    tasks: ["political science", "voting behavior", "public opinion"],
    size: "80+ years of data",
    features: ["Pre/post election surveys", "Panel studies", "Time series"],
    citation: "American National Election Studies. (2021). ANES 2020 Time Series Study. Stanford University and the University of Michigan."
  },
  {
    name: "Current Population Survey",
    description: "Monthly US labor force statistics",
    category: "Social Sciences",
    url: "https://www.census.gov/programs-surveys/cps.html",
    format: "CSV, various",
    license: "Public Domain",
    tasks: ["labor economics", "employment analysis", "economic indicators"],
    size: "60,000 households monthly",
    features: ["Employment status", "Demographics", "Income data"],
    citation: "U.S. Census Bureau. Current Population Survey. Retrieved from https://www.census.gov/programs-surveys/cps.html"
  },
  {
    name: "World Bank WDI",
    description: "World Development Indicators database",
    category: "Social Sciences",
    url: "https://databank.worldbank.org/source/world-development-indicators",
    format: "CSV, Excel, API",
    license: "CC BY 4.0",
    tasks: ["development research", "cross-country analysis", "SDG tracking"],
    size: "1,600+ indicators",
    features: ["217 economies", "60+ years", "SDG indicators"],
    citation: "World Bank. (2023). World Development Indicators. Washington, DC: World Bank Group."
  },
  {
    name: "GDELT",
    description: "Global Database of Events, Language, and Tone",
    category: "Social Sciences",
    url: "https://www.gdeltproject.org/",
    format: "CSV, BigQuery",
    license: "CC BY",
    tasks: ["event analysis", "conflict research", "media monitoring"],
    size: "40 years, 24/7 updates",
    features: ["News events", "Actor extraction", "Sentiment/tone", "Global coverage"],
    citation: "Leetaru, K., & Schrodt, P. A. (2013). GDELT: Global data on events, location, and tone, 1979-2012. ISA Annual Convention."
  },
  {
    name: "UN Comtrade",
    description: "United Nations international trade statistics",
    category: "Social Sciences",
    url: "https://comtrade.un.org/",
    format: "CSV, API",
    license: "UN Terms",
    tasks: ["international trade", "economics", "globalization research"],
    size: "3B+ records",
    features: ["Merchandise trade", "Trade partners", "HS commodity codes"],
    citation: "United Nations. (2023). UN Comtrade Database. Retrieved from https://comtrade.un.org/"
  },
  {
    name: "Twitter Academic API",
    description: "Historical and real-time Twitter data for research",
    category: "Social Sciences",
    url: "https://developer.twitter.com/en/products/twitter-api/academic-research",
    format: "JSON",
    license: "Twitter Terms",
    tasks: ["social media analysis", "sentiment analysis", "network analysis"],
    size: "Full archive access",
    features: ["Historical tweets", "Academic access", "Academic track"],
    citation: "Twitter. (2023). Twitter API Academic Research Product Track. Retrieved from https://developer.twitter.com/"
  },

  // ==========================================================================
  // Physics
  // ==========================================================================
  {
    name: "LHC Open Data",
    description: "CERN Large Hadron Collider data releases",
    category: "Physics",
    url: "http://opendata.cern.ch/",
    format: "ROOT, CSV, JSON",
    license: "CC0",
    tasks: ["particle physics", "Higgs analysis", "data analysis education"],
    size: "2.5M events released",
    features: ["Collision data", "Simulated data", "Analysis code"],
    citation: "CERN. (2023). CERN Open Data Portal. Retrieved from http://opendata.cern.ch/"
  },
  {
    name: "SDSS",
    description: "Sloan Digital Sky Survey astronomical data",
    category: "Physics",
    url: "https://www.sdss.org/",
    format: "FITS, CSV",
    license: "Public Domain",
    tasks: ["astronomy", "galaxy classification", "cosmology"],
    size: "1/3 of sky mapped",
    features: ["Optical spectra", "Imaging", "Redshift measurements"],
    citation: "Abdurro'uf et al. (2022). The seventeenth data release of the Sloan Digital Sky Surveys: Complete release of MaNGA, MaStar, and APOGEE-2 data. ApJS, 259(2), 35."
  },
  {
    name: "LIGO Open Data",
    description: "Gravitational wave data from LIGO/Virgo",
    category: "Physics",
    url: "https://www.gw-openscience.org/",
    format: "HDF5, GWOSC",
    license: "CC0",
    tasks: ["gravitational wave analysis", "signal processing", "astrophysics"],
    size: "O1-O3 observing runs",
    features: ["Strain data", "Event catalogs", "Detector characterization"],
    citation: "Vallisneri, M., Kanner, J., Williams, R., et al. (2015). The LIGO Open Science Center. J. Phys. Conf. Ser., 610(1), 012021."
  },
  {
    name: "HEPData",
    description: "Repository for high-energy physics data",
    category: "Physics",
    url: "https://www.hepdata.net/",
    format: "YAML, JSON, ROOT",
    license: "CC0",
    tasks: ["particle physics", "experimental data", "theory comparison"],
    size: "10,000+ publications",
    features: ["Cross sections", "Kinematic distributions", "Supplementary material"],
    citation: "Maguire, E., Heinrich, L., & Watt, G. (2017). HEPData: a repository for high energy physics data. J. Phys. Conf. Ser., 898(10), 102006."
  },
  {
    name: "INSPIRE-HEP",
    description: "High energy physics literature and data",
    category: "Physics",
    url: "https://inspirehep.net/",
    format: "Various",
    license: "Various",
    tasks: ["bibliometrics", "literature search", "citation analysis"],
    size: "1M+ records",
    features: ["Publications", "Authors", "Citations", "Data links"],
    citation: "INSPIRE Collaboration. (2023). INSPIRE-HEP. Retrieved from https://inspirehep.net/"
  },
  {
    name: "Particle Data Group",
    description: "Review of Particle Physics with particle properties",
    category: "Physics",
    url: "https://pdg.lbl.gov/",
    format: "PDF, HTML, various",
    license: "PDG License",
    tasks: ["particle physics reference", "data lookup", "physics education"],
    size: "Comprehensive reference",
    features: ["Particle properties", "Decay modes", "Standard Model parameters"],
    citation: "Workman, R. L., & Others. (2022). Review of Particle Physics. PTEP, 2022, 083C01."
  },
  {
    name: "IceCube Neutrinos",
    description: "High-energy neutrino events from IceCube",
    category: "Physics",
    url: "https://icecube.wisc.edu/data-releases/",
    format: "FITS, CSV",
    license: "CC BY 4.0",
    tasks: ["neutrino astrophysics", "high-energy physics", "multi-messenger astronomy"],
    size: "100+ high-energy events",
    features: ["Neutrino directions", "Energies", "Time stamps"],
    citation: "IceCube Collaboration. (2013). Evidence for high-energy extraterrestrial neutrinos at the IceCube detector. Science, 342(6161), 1242856."
  },
  {
    name: "Planck CMB",
    description: "Cosmic Microwave Background data from Planck satellite",
    category: "Physics",
    url: "https://pla.esac.esa.int/",
    format: "FITS",
    license: "ESA License",
    tasks: ["cosmology", "CMB analysis", "parameter estimation"],
    size: "All-sky maps",
    features: ["Temperature maps", "Polarization maps", "Likelihood code"],
    citation: "Planck Collaboration. (2020). Planck 2018 results. I. Overview, and the cosmological legacy of Planck. A&A, 641, A1."
  },
  {
    name: "WMAP",
    description: "Wilkinson Microwave Anisotropy Probe CMB data",
    category: "Physics",
    url: "https://lambda.gsfc.nasa.gov/product/map/",
    format: "FITS",
    license: "Public Domain",
    tasks: ["cosmology", "CMB analysis", "early universe"],
    size: "9 years of data",
    features: ["Full-sky maps", "Power spectra", "Cosmological parameters"],
    citation: "Bennett, C. L., Larson, D., Weiland, J. L., et al. (2013). Nine-year Wilkinson Microwave Anisotropy Probe (WMAP) observations: final maps and results. ApJS, 208(2), 20."
  },
  {
    name: "NIST Atomic Spectra",
    description: "Atomic spectra database from NIST",
    category: "Physics",
    url: "https://physics.nist.gov/PhysRefData/ASD/",
    format: "HTML, ASCII",
    license: "Public Domain",
    tasks: ["atomic physics", "spectroscopy", "plasma physics"],
    size: "All elements",
    features: ["Energy levels", "Transitions", "Wavelengths"],
    citation: "Kramida, A., Ralchenko, Y., Reader, J., & NIST ASD Team. (2022). NIST Atomic Spectra Database (ver. 5.10). National Institute of Standards and Technology."
  },

  // ==========================================================================
  // Chemistry
  // ==========================================================================
  {
    name: "PubChem",
    description: "Chemical database of molecules and their activities",
    category: "Chemistry",
    url: "https://pubchem.ncbi.nlm.nih.gov/",
    format: "SDF, JSON, XML",
    license: "Public Domain",
    tasks: ["cheminformatics", "drug discovery", "molecular property prediction"],
    size: "110M+ compounds",
    features: ["Chemical structures", "Bioactivities", "Safety data"],
    citation: "Kim, S., Chen, J., Cheng, T., et al. (2021). PubChem in 2021: new data content and improved web interfaces. Nucleic Acids Research, 49(D1), D1388-D1395."
  },
  {
    name: "ChEMBL",
    description: "Bioactive drug-like small molecule database",
    category: "Chemistry",
    url: "https://www.ebi.ac.uk/chembl/",
    format: "SDF, TSV, JSON",
    license: "CC BY-SA 3.0",
    tasks: ["drug discovery", "QSAR", "target prediction"],
    size: "2M+ compounds, 18M+ activities",
    features: ["Structure-activity data", "Target annotations", "Assay data"],
    citation: "Mendez, D., Gaulton, A., Bento, A. P., et al. (2019). ChEMBL: towards direct deposition of bioassay data. Nucleic Acids Research, 47(D1), D930-D940."
  },
  {
    name: "ZINC",
    description: "Database of commercially available compounds for virtual screening",
    category: "Chemistry",
    url: "https://zinc.docking.org/",
    format: "SDF, SMILES",
    license: "Free",
    tasks: ["virtual screening", "docking", "drug design"],
    size: "1B+ molecules",
    features: ["Purchasable compounds", "3D structures", "Property filtering"],
    citation: "Sterling, T., & Irwin, J. J. (2015). ZINC 15--ligand discovery for everyone. Journal of Chemical Information and Modeling, 55(11), 2324-2337."
  },
  {
    name: "QM9",
    description: "Quantum chemistry calculations for 134k small molecules",
    category: "Chemistry",
    url: "http://quantum-machine.org/datasets/",
    format: "XYZ, CSV",
    license: "CC0",
    tasks: ["quantum chemistry", "molecular property prediction", "ML for chemistry"],
    size: "134k molecules",
    features: ["DFT calculations", "13 properties", "Up to 9 heavy atoms"],
    citation: "Ramakrishnan, R., Dral, P. O., Rupp, M., & von Lilienfeld, O. A. (2014). Quantum chemistry structures and properties of 134 kilo molecules. Scientific Data, 1, 140022."
  },
  {
    name: "Materials Project",
    description: "Computational materials science database",
    category: "Chemistry",
    url: "https://materialsproject.org/",
    format: "JSON, CIF",
    license: "CC BY 4.0",
    tasks: ["materials discovery", "DFT calculations", "battery research"],
    size: "150,000+ materials",
    features: ["Electronic structure", "Crystal structures", "Properties"],
    citation: "Jain, A., Ong, S. P., Hautier, G., et al. (2013). The Materials Project: A materials genome approach to accelerating materials innovation. APL Materials, 1(1), 011002."
  },
  {
    name: "AFLOW",
    description: "Automatic FLOW for materials discovery",
    category: "Chemistry",
    url: "http://aflowlib.org/",
    format: "CIF, JSON",
    license: "CC BY 4.0",
    tasks: ["materials informatics", "high-throughput DFT", "structure prediction"],
    size: "3M+ compounds",
    features: ["Calculated properties", "Prototype encyclopedia", "Thermal properties"],
    citation: "Curtarolo, S., Setyawan, W., Wang, S., et al. (2012). AFLOWLIB.ORG: A distributed materials properties repository from high-throughput ab initio calculations. Computational Materials Science, 58, 227-235."
  },
  {
    name: "NIST Chemistry WebBook",
    description: "Thermochemical and spectral data for chemical species",
    category: "Chemistry",
    url: "https://webbook.nist.gov/chemistry/",
    format: "HTML, TXT",
    license: "Public Domain",
    tasks: ["thermochemistry", "spectroscopy", "physical chemistry"],
    size: "70,000+ compounds",
    features: ["Thermodynamic data", "IR spectra", "Mass spectra", "Ion energetics"],
    citation: "Linstrom, P. J., & Mallard, W. G. (Eds.). (2021). NIST Chemistry WebBook, NIST Standard Reference Database Number 69. National Institute of Standards and Technology."
  },
  {
    name: "Cambridge Structural Database",
    description: "Comprehensive database of crystal structures",
    category: "Chemistry",
    url: "https://www.ccdc.cam.ac.uk/structures/",
    format: "CIF",
    license: "CSD License",
    tasks: ["crystallography", "structural chemistry", "drug design"],
    size: "1.1M+ structures",
    features: ["Organic and metal-organic", "3D coordinates", "Bibliographic data"],
    citation: "Groom, C. R., Bruno, I. J., Lightfoot, M. P., & Ward, S. C. (2016). The Cambridge Structural Database. Acta Crystallographica B, 72(2), 171-179."
  },
  {
    name: "Protein Data Bank",
    description: "3D structural data of biological macromolecules",
    category: "Chemistry",
    url: "https://www.rcsb.org/",
    format: "PDB, mmCIF",
    license: "Public Domain",
    tasks: ["structural biology", "protein structure", "drug design"],
    size: "200,000+ structures",
    features: ["X-ray, NMR, Cryo-EM", "Ligand binding", "Structural validation"],
    citation: "Berman, H. M., Westbrook, J., Feng, Z., et al. (2000). The Protein Data Bank. Nucleic Acids Research, 28(1), 235-242."
  },
  {
    name: "BindingDB",
    description: "Binding affinities for protein-ligand interactions",
    category: "Chemistry",
    url: "https://www.bindingdb.org/",
    format: "TSV, SDF",
    license: "BindingDB Terms",
    tasks: ["drug discovery", "binding affinity prediction", "molecular docking"],
    size: "2.7M+ binding data",
    features: ["Ki, Kd, IC50 values", "Target proteins", "Small molecules"],
    citation: "Gilson, M. K., Liu, T., Baitaluk, M., et al. (2016). BindingDB in 2015: A public database for medicinal chemistry, computational chemistry and systems pharmacology. Nucleic Acids Research, 44(D1), D1045-D1053."
  },
  {
    name: "DrugBank",
    description: "Bioinformatics and cheminformatics resource on drugs",
    category: "Chemistry",
    url: "https://go.drugbank.com/",
    format: "XML, CSV, SDF",
    license: "DrugBank License",
    tasks: ["drug discovery", "pharmacology", "drug repurposing"],
    size: "15,000+ drugs",
    features: ["FDA-approved drugs", "Drug targets", "Drug interactions"],
    citation: "Wishart, D. S., Feunang, Y. D., Guo, A. C., et al. (2018). DrugBank 5.0: a major update to the DrugBank database for 2018. Nucleic Acids Research, 46(D1), D1074-D1082."
  },

  // ==========================================================================
  // Astronomy
  // ==========================================================================
  {
    name: "Gaia DR3",
    description: "ESA's billion-star survey with positions, parallaxes, and proper motions",
    category: "Astronomy",
    url: "https://www.cosmos.esa.int/web/gaia/data-release-3",
    format: "FITS, CSV",
    license: "ESA License",
    tasks: ["stellar astronomy", "Galaxy mapping", "astrometry"],
    size: "1.8 billion sources",
    features: ["Positions, parallaxes", "Proper motions", "Spectrophotometry", "Radial velocities"],
    citation: "Gaia Collaboration. (2023). Gaia Data Release 3. Summary of the contents and survey properties. A&A, 674, A1."
  },
  {
    name: "Sloan Digital Sky Survey",
    description: "Deep multi-color imaging and spectroscopic redshift survey",
    category: "Astronomy",
    url: "https://www.sdss.org/",
    format: "FITS",
    license: "Public Domain",
    tasks: ["galaxy classification", "large-scale structure", "cosmology"],
    size: "1/3 of sky, 4M+ spectra",
    features: ["Optical imaging", "Spectroscopy", "Redshifts", "Star/galaxy/QSO"],
    citation: "Abdurro'uf et al. (2022). The seventeenth data release of the Sloan Digital Sky Surveys. ApJS, 259(2), 35."
  },
  {
    name: "2MASS",
    description: "Two Micron All Sky Survey in near-infrared",
    category: "Astronomy",
    url: "https://irsa.ipac.caltech.edu/Missions/2mass.html",
    format: "FITS",
    license: "Public Domain",
    tasks: ["infrared astronomy", "stellar populations", "Galaxy structure"],
    size: "470M+ sources",
    features: ["J, H, Ks bands", "All-sky coverage", "Point sources and extended"],
    citation: "Skrutskie, M. F., Cutri, R. M., Stiening, R., et al. (2006). The Two Micron All Sky Survey (2MASS). AJ, 131(2), 1163-1183."
  },
  {
    name: "Hubble Legacy Archive",
    description: "HST images and spectra from multiple instruments",
    category: "Astronomy",
    url: "https://hla.stsci.edu/",
    format: "FITS",
    license: "STScI License",
    tasks: ["deep imaging", "galaxy evolution", "stellar populations"],
    size: "1M+ images",
    features: ["Multi-wavelength", "Drizzled images", "Source catalogs"],
    citation: "STScI. (2023). Hubble Legacy Archive. Retrieved from https://hla.stsci.edu/"
  },
  {
    name: "VizieR",
    description: "Catalog service for astronomical data",
    category: "Astronomy",
    url: "https://vizier.cds.unistra.fr/",
    format: "Various",
    license: "Various",
    tasks: ["catalog queries", "cross-matching", "data mining"],
    size: "20,000+ catalogs",
    features: ["Published tables", "Photometry", "Astrometry", "Spectroscopy"],
    citation: "Ochsenbein, F., Bauer, P., & Marcout, J. (2000). The VizieR database of astronomical catalogues. A&AS, 143, 23-26."
  },
  {
    name: "SIMBAD",
    description: "Set of Identifications, Measurements and Bibliography for Astronomical Data",
    category: "Astronomy",
    url: "http://simbad.u-strasbg.fr/simbad/",
    format: "Various",
    license: "CDS Terms",
    tasks: ["object identification", "bibliography", "basic data lookup"],
    size: "12M+ objects",
    features: ["Cross-identifications", "Bibliography", "Measurements", "Object types"],
    citation: "Wenger, M., Ochsenbein, F., Egret, D., et al. (2000). The SIMBAD astronomical database. The CDS reference database for astronomical objects. A&AS, 143, 9-22."
  },
  {
    name: "NASA Exoplanet Archive",
    description: "Confirmed and candidate exoplanets with stellar and planetary parameters",
    category: "Astronomy",
    url: "https://exoplanetarchive.ipac.caltech.edu/",
    format: "CSV, IPAC table",
    license: "Public Domain",
    tasks: ["exoplanet research", "habitability studies", "population analysis"],
    size: "5,000+ confirmed planets",
    features: ["Planetary parameters", "Stellar hosts", "Transit data", "RV data"],
    citation: "Akeson, R. L., Chen, X., Ciardi, D., et al. (2013). The NASA Exoplanet Archive: Data and tools for exoplanet research. PASP, 125(930), 989."
  },
  {
    name: "TESS",
    description: "Transiting Exoplanet Survey Satellite full-frame images and light curves",
    category: "Astronomy",
    url: "https://archive.stsci.edu/missions-and-data/tess",
    format: "FITS",
    license: "Public Domain",
    tasks: ["exoplanet detection", "transit photometry", "stellar variability"],
    size: "85% of sky",
    features: ["2-minute cadence", "20-second cadence", "Full-frame images"],
    citation: "Ricker, G. R., Winn, J. N., Vanderspek, R., et al. (2015). Transiting Exoplanet Survey Satellite (TESS). JATIS, 1(1), 014003."
  },
  {
    name: "Kepler",
    description: "Kepler mission data for exoplanet hunting",
    category: "Astronomy",
    url: "https://archive.stsci.edu/kepler/",
    format: "FITS",
    license: "Public Domain",
    tasks: ["exoplanet detection", "asteroseismology", "stellar physics"],
    size: "500,000+ stars",
    features: ["Long cadence", "Short cadence", "Confirmed planets", "KOI catalog"],
    citation: "Borucki, W. J., Koch, D., Basri, G., et al. (2010). Kepler planet-detection mission: introduction and first results. Science, 327(5968), 977-980."
  },
  {
    name: "AllWISE",
    description: "Wide-field Infrared Survey Explorer all-sky data",
    category: "Astronomy",
    url: "https://irsa.ipac.caltech.edu/Missions/wise.html",
    format: "FITS",
    license: "Public Domain",
    tasks: ["infrared astronomy", "brown dwarfs", "asteroid detection"],
    size: "750M+ sources",
    features: ["3.4, 4.6, 12, 22 microns", "All-sky coverage", "Time series"],
    citation: "Cutri, R. M., Wright, E. L., Conrow, T., et al. (2021). AllWISE Data Release. NASA/IPAC Infrared Science Archive."
  },
  {
    name: "Pan-STARRS1",
    description: "Panoramic Survey Telescope and Rapid Response System",
    category: "Astronomy",
    url: "https://panstarrs.stsci.edu/",
    format: "FITS",
    license: "Public Domain",
    tasks: ["optical survey", "solar system objects", "transient detection"],
    size: "3 billion sources",
    features: ["grizy bands", "3pi steradians", "Mean and stack images"],
    citation: "Chambers, K. C., Magnier, E. A., Metcalfe, N., et al. (2016). The Pan-STARRS1 Surveys. arXiv:1612.05560."
  },
  {
    name: "DESI Legacy Imaging Surveys",
    description: "Deep optical and infrared imaging for DESI target selection",
    category: "Astronomy",
    url: "http://legacysurvey.org/",
    format: "FITS",
    license: "Public Domain",
    tasks: ["galaxy surveys", "target selection", "deep imaging"],
    size: "16,000 deg²",
    features: ["g, r, z bands", "WISE W1, W2", "Source detection", "Tractor modeling"],
    citation: "Dey, A., Schlegel, D. J., Lang, D., et al. (2019). Overview of the DESI Legacy Imaging Surveys. AJ, 157(5), 168."
  }
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate relevance score for a dataset given a query
 * Uses AND logic for multi-word queries
 * Higher score for exact phrase matches
 */
function calculateRelevance(dataset, queryWords) {
  let score = 0;
  const text = `${dataset.name} ${dataset.description} ${dataset.category} ${dataset.tasks.join(' ')}`.toLowerCase();

  // Check if all query words appear (AND logic)
  const allWordsPresent = queryWords.every(word => text.includes(word));
  if (!allWordsPresent) return 0;

  // Score for individual word matches
  for (const word of queryWords) {
    // Name match gets highest score
    if (dataset.name.toLowerCase().includes(word)) score += 10;
    // Description match
    if (dataset.description.toLowerCase().includes(word)) score += 5;
    // Task match
    if (dataset.tasks.some(t => t.toLowerCase().includes(word))) score += 8;
    // Category match
    if (dataset.category.toLowerCase().includes(word)) score += 6;
  }

  // Bonus for exact phrase match
  const fullQuery = queryWords.join(' ');
  if (dataset.description.toLowerCase().includes(fullQuery)) score += 15;
  if (dataset.name.toLowerCase().includes(fullQuery)) score += 20;

  return score;
}

/**
 * Filter datasets by field/category
 */
function filterByField(datasets, field) {
  if (!field) return datasets;
  const fieldLower = field.toLowerCase();
  return datasets.filter(d =>
    d.category.toLowerCase() === fieldLower ||
    d.category.toLowerCase().includes(fieldLower)
  );
}

/**
 * Filter datasets by task
 */
function filterByTask(datasets, task) {
  if (!task) return datasets;
  const taskLower = task.toLowerCase();
  return datasets.filter(d =>
    d.tasks.some(t => t.toLowerCase().includes(taskLower))
  );
}

/**
 * Format dataset for display
 */
function formatDataset(dataset, includeDetails = false) {
  const base = {
    name: dataset.name,
    description: dataset.description,
    category: dataset.category,
    url: dataset.url,
    format: dataset.format,
    license: dataset.license,
    tasks: dataset.tasks,
    size: dataset.size
  };

  if (includeDetails) {
    return {
      ...base,
      features: dataset.features,
      citation: dataset.citation
    };
  }

  return base;
}

/**
 * Generate citation in different formats
 */
function formatCitation(dataset, format = 'apa') {
  if (format === 'bibtex') {
    const key = dataset.name.toLowerCase().replace(/\s+/g, '_');
    return `@misc{${key},
  title = {${dataset.name}},
  author = {Dataset Repository},
  year = {2024},
  url = {${dataset.url}},
  note = {${dataset.description}}
}`;
  }

  // APA format
  return dataset.citation || `${dataset.name}. Retrieved from ${dataset.url}`;
}

// ============================================================================
// COMMAND IMPLEMENTATIONS
// ============================================================================

/**
 * Search command - search datasets with AND logic
 */
async function searchCommand(args, context) {
  const { query, limit = 10, field, task } = args;

  if (!query || typeof query !== 'string') {
    return { error: 'Query parameter is required' };
  }

  // Parse query into words (AND logic)
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  if (queryWords.length === 0) {
    return { error: 'Query must contain at least one word' };
  }

  // Filter by field and task first
  let candidates = DATASET_CATALOGUE;
  candidates = filterByField(candidates, field);
  candidates = filterByTask(candidates, task);

  // Calculate relevance scores
  const scored = candidates.map(dataset => ({
    dataset,
    score: calculateRelevance(dataset, queryWords)
  })).filter(item => item.score > 0);

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Take top results
  const results = scored.slice(0, limit).map(item => ({
    ...formatDataset(item.dataset),
    relevance: item.score
  }));

  return {
    query,
    queryWords,
    filters: { field, task },
    totalMatches: scored.length,
    datasets: results
  };
}

function stripJsonFences(text) {
  return text.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();
}

/**
 * Recommend command - recommend datasets for a topic
 */
async function recommendCommand(args, context) {
  const { topic, field, type = 'research' } = args;
  const llmClient = context?.llmClient;

  if (!topic || typeof topic !== 'string') {
    return { error: 'Topic parameter is required' };
  }

  // Filter by field if specified
  let candidates = DATASET_CATALOGUE;
  if (field) {
    candidates = filterByField(candidates, field);
  }

  // If LLM is available, use it for intelligent matching
  if (llmClient) {
    try {
      const prompt = `Given the research topic "${topic}", analyze which of these datasets would be most relevant:

${candidates.slice(0, 30).map((d, i) => `${i + 1}. ${d.name} (${d.category}): ${d.description}
   Tasks: ${d.tasks.join(', ')}`).join('\n\n')}

Recommend the top 5-8 most relevant datasets with specific reasons why each would be useful for "${topic}". Format as JSON:
[{"name": "Dataset Name", "reason": "Why this dataset is relevant"}]`;

      const response = await llmClient.chat([{role:"user",content:prompt}]);
      // Parse recommendations and match with full dataset info
      try {
        const rawText = typeof response === "string" ? response : (response.content || "{}");
        const parsed = JSON.parse(stripJsonFences(rawText));
        const recommendations = parsed.map(rec => {
          const dataset = DATASET_CATALOGUE.find(d => d.name === rec.name);
          return dataset ? {
            ...formatDataset(dataset),
            recommendation: rec.reason
          } : null;
        }).filter(Boolean);

        return {
          topic,
          type,
          method: 'ai-assisted',
          recommendations
        };
      } catch (e) {
        // Fall through to keyword matching
      }
    } catch (e) {
      // Fall through to keyword matching
    }
  }

  // Keyword-based matching fallback
  const topicWords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  const scored = candidates.map(dataset => {
    let score = 0;
    const text = `${dataset.name} ${dataset.description} ${dataset.tasks.join(' ')}`.toLowerCase();

    for (const word of topicWords) {
      if (text.includes(word)) score += 1;
    }

    // Boost for exact topic match in tasks
    if (dataset.tasks.some(t => t.toLowerCase().includes(topic.toLowerCase()))) {
      score += 5;
    }

    return { dataset, score };
  }).filter(item => item.score > 0);

  scored.sort((a, b) => b.score - a.score);

  const recommendations = scored.slice(0, 8).map(item => ({
    ...formatDataset(item.dataset),
    relevance: item.score,
    recommendation: `Matches ${type} needs in ${item.dataset.category} with tasks: ${item.dataset.tasks.slice(0, 3).join(', ')}`
  }));

  return {
    topic,
    type,
    method: 'keyword-matching',
    recommendations
  };
}

/**
 * Info command - get detailed information about a dataset
 */
async function infoCommand(args, context) {
  const { name } = args;

  if (!name || typeof name !== 'string') {
    return { error: 'Name parameter is required' };
  }

  const dataset = DATASET_CATALOGUE.find(d =>
    d.name.toLowerCase() === name.toLowerCase()
  );

  if (!dataset) {
    // Try partial match
    const matches = DATASET_CATALOGUE.filter(d =>
      d.name.toLowerCase().includes(name.toLowerCase())
    );

    if (matches.length === 1) {
      return formatDataset(matches[0], true);
    } else if (matches.length > 1) {
      return {
        error: `Multiple matches found for "${name}"`,
        matches: matches.map(d => d.name)
      };
    }

    return { error: `Dataset "${name}" not found` };
  }

  return formatDataset(dataset, true);
}

/**
 * Manifest command - generate dataset usage manifest
 */
async function manifestCommand(args, context) {
  const { names, format = 'json' } = args;

  if (!names || !Array.isArray(names) || names.length === 0) {
    return { error: 'Names parameter must be a non-empty array' };
  }

  const datasets = [];
  const notFound = [];

  for (const name of names) {
    const dataset = DATASET_CATALOGUE.find(d =>
      d.name.toLowerCase() === name.toLowerCase()
    );

    if (dataset) {
      datasets.push(dataset);
    } else {
      notFound.push(name);
    }
  }

  if (format === 'markdown') {
    let md = '# Dataset Usage Manifest\n\n';
    md += `Generated: ${new Date().toISOString()}\n\n`;
    md += '## Datasets Used\n\n';

    for (const dataset of datasets) {
      md += `### ${dataset.name}\n\n`;
      md += `- **Category:** ${dataset.category}\n`;
      md += `- **Description:** ${dataset.description}\n`;
      md += `- **Size:** ${dataset.size}\n`;
      md += `- **Format:** ${dataset.format}\n`;
      md += `- **License:** ${dataset.license}\n`;
      md += `- **URL:** ${dataset.url}\n`;
      md += `- **Tasks:** ${dataset.tasks.join(', ')}\n\n`;
      md += '**Features:**\n';
      for (const feature of dataset.features) {
        md += `- ${feature}\n`;
      }
      md += `\n**Citation:**\n${dataset.citation}\n\n`;
      md += '---\n\n';
    }

    md += '## References\n\n';
    for (const dataset of datasets) {
      md += `${dataset.citation}\n\n`;
    }

    return {
      format: 'markdown',
      manifest: md,
      datasetsFound: datasets.length,
      notFound
    };
  }

  // JSON format
  return {
    format: 'json',
    manifest: {
      generated: new Date().toISOString(),
      datasets: datasets.map(d => ({
        name: d.name,
        category: d.category,
        description: d.description,
        size: d.size,
        format: d.format,
        license: d.license,
        url: d.url,
        tasks: d.tasks,
        features: d.features,
        citation: d.citation
      }))
    },
    datasetsFound: datasets.length,
    notFound
  };
}

/**
 * List command - list all datasets
 */
async function listCommand(args, context) {
  const { field, format = 'table' } = args;

  let datasets = DATASET_CATALOGUE;
  if (field) {
    datasets = filterByField(datasets, field);
  }

  // Group by category
  const grouped = {};
  for (const dataset of datasets) {
    if (!grouped[dataset.category]) {
      grouped[dataset.category] = [];
    }
    grouped[dataset.category].push(dataset);
  }

  if (format === 'json') {
    return {
      total: datasets.length,
      categories: Object.keys(grouped),
      grouped: Object.fromEntries(
        Object.entries(grouped).map(([cat, items]) => [
          cat,
          items.map(d => formatDataset(d))
        ])
      )
    };
  }

  // Table format (default)
  const rows = [];
  for (const [category, items] of Object.entries(grouped).sort()) {
    rows.push({ category, name: '---', description: '---', size: '---' });
    for (const dataset of items) {
      rows.push({
        category: '',
        name: dataset.name,
        description: dataset.description.slice(0, 60) + '...',
        size: dataset.size
      });
    }
  }

  return {
    format: 'table',
    total: datasets.length,
    categories: Object.keys(grouped).sort(),
    table: rows
  };
}

// ============================================================================
// EXPORT COMMANDS
// ============================================================================

export const commands = [
  {
    name: 'search',
    description: 'Search datasets by query with AND logic, supports field and task filtering',
    execute: searchCommand
  },
  {
    name: 'recommend',
    description: 'Recommend datasets for a research topic (5-8 datasets with reasoning)',
    execute: recommendCommand
  },
  {
    name: 'info',
    description: 'Get detailed information about a specific dataset',
    execute: infoCommand
  },
  {
    name: 'manifest',
    description: 'Generate dataset usage manifest for academic papers (JSON or Markdown)',
    execute: manifestCommand
  },
  {
    name: 'list',
    description: 'List all datasets grouped by category',
    execute: listCommand
  }
];

// Also export the catalogue for direct access
export { DATASET_CATALOGUE };

// Default export for module
export default { commands, DATASET_CATALOGUE };
